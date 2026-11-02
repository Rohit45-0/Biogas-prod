"""Reproducible research model assessment; never overwrites deployed ML artifacts.

Input is a read-only JSON extraction of the original Excel workbooks. Each book
contains file/path/sha256 and sheets with rows (including original preambles).
Run with --workbooks PATH; --hours-only produces the portable research model.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import posixpath
import xml.etree.ElementTree as ET
import zipfile

import numpy as np
import sklearn
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import ExtraTreesRegressor, GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import LeaveOneOut, TimeSeriesSplit
from sklearn.multioutput import MultiOutputRegressor
from sklearn.neighbors import KNeighborsRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'ai-workflow' / 'research'
HOURS_FILE = 'AQUAIVOLT_Hours-Scale_AI_Synthetic_500rows hrt hours.xlsx'
HOURS_SHEET = 'Hours-Scale AI Synthetic 500'
SCADA_FILE = 'AQUAIVOLT_AI_Biogas_SCADA_Dataset_Template.xlsx'
ANCHOR_FILE = 'AQUAIVOLT_10_Biogas_Optimization_10Scenarios.xlsx'
KEYS = ['biogasM3Day', 'methanePct', 'feedRate', 'temperature', 'ph', 'olr',
        'h2sBeforePpm', 'h2sAfterPpm', 'stabilityPct']
UNITS = ['m3/day', '%', 'kg VS/day', 'degC', 'pH', 'kg VS/m3/day', 'ppm', 'ppm', '%']


def read_workbooks(source_dir):
    """Read cached XLSX cell values with stdlib only; do not modify workbooks."""
    ns = {'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    relationship_ns = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    books = []
    paths = sorted(set(source_dir.glob('AQUAIVOLT*.xlsx')) | set(source_dir.glob('10 more*.xlsx')))
    for path in paths:
        sheets = []
        with zipfile.ZipFile(path) as archive:
            shared = []
            if 'xl/sharedStrings.xml' in archive.namelist():
                shared = [''.join(item.itertext()) for item in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
            relationships = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
            targets = {r.attrib['Id']: r.attrib['Target'] for r in relationships}
            workbook = ET.fromstring(archive.read('xl/workbook.xml'))
            for sheet in workbook.findall('x:sheets/x:sheet', ns):
                target = targets[sheet.attrib[f'{{{relationship_ns}}}id']]
                location = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
                document = ET.fromstring(archive.read(location))
                rows, widest = [], 0
                for element in document.findall('x:sheetData/x:row', ns):
                    values = {}
                    for cell in element.findall('x:c', ns):
                        letters = ''.join(c for c in cell.attrib['r'] if c.isalpha())
                        column = 0
                        for letter in letters:
                            column = column * 26 + ord(letter.upper()) - ord('A') + 1
                        kind = cell.attrib.get('t')
                        value_element = cell.find('x:v', ns)
                        value = value_element.text if value_element is not None else None
                        if kind == 'inlineStr':
                            value = ''.join(t.text or '' for t in cell.findall('x:is//x:t', ns))
                        elif kind == 's' and value is not None:
                            value = shared[int(value)]
                        elif kind == 'b' and value is not None:
                            value = bool(int(value))
                        elif value is not None and kind not in ['str', 'e']:
                            numeric = float(value)
                            value = int(numeric) if numeric.is_integer() else numeric
                        values[column - 1] = value
                    if values and any(value is not None for value in values.values()):
                        count = max(values) + 1
                        widest = max(widest, count)
                        rows.append([values.get(i) for i in range(count)])
                rows = [row + [None] * (widest - len(row)) for row in rows]
                sheets.append(dict(name=sheet.attrib['name'], rows=rows, row_count=len(rows), column_count=widest))
        books.append(dict(file=path.name, path=str(path), sha256=hashlib.sha256(path.read_bytes()).hexdigest(), sheets=sheets))
    return books


def write(name, value):
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / name
    temporary = target.with_suffix(target.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n', encoding='utf-8', newline='\n')
    temporary.replace(target)


def table(book, sheet_name, header_value):
    sheet = next(s for s in book['sheets'] if s['name'] == sheet_name)
    start = next(i for i, row in enumerate(sheet['rows']) if row and row[0] == header_value)
    header = sheet['rows'][start]
    return header, sheet['rows'][start + 1:], start + 2


def scores(actual, predicted, keys, units=None):
    units = units or [''] * len(keys)
    result = []
    for i, key in enumerate(keys):
        result.append(dict(key=key, unit=units[i], mae=float(mean_absolute_error(actual[:, i], predicted[:, i])),
                           rmse=float(np.sqrt(mean_squared_error(actual[:, i], predicted[:, i]))),
                           r2=float(r2_score(actual[:, i], predicted[:, i])) if len(actual) > 1 and np.ptp(actual[:, i]) > 1e-12 else None))
    return result


def normalized_mae(y, prediction, train_y):
    scale = np.maximum(np.std(train_y, axis=0), 1e-9)
    return float(np.mean(np.mean(np.abs(y - prediction), axis=0) / scale))


def basis(hours, config):
    x = (np.asarray(hours, dtype=float) - 13) / 11
    if config['kind'] == 'mean':
        return np.zeros((len(x), 1))
    if config['kind'] == 'polynomial':
        return np.column_stack([x ** degree for degree in range(1, config['degree'] + 1)])
    return np.column_stack([x] + [np.maximum(0, x - knot) for knot in config['knots']])


def hours_fit(hours, y, config):
    estimator = Ridge(alpha=config.get('alpha', 0), fit_intercept=True)
    estimator.fit(basis(hours, config), y)
    return estimator


def hours_study(books):
    source = books[HOURS_FILE]
    header, original, _ = table(source, HOURS_SHEET, 'Run ID')
    # Verified original worksheet rows: row 4 is blank, header is row 5,
    # RUN-H001 starts on row 6. The extraction omits wholly empty rows.
    first_row = 6
    lookup = {name: index for index, name in enumerate(header)}
    mapping = {
        'biogasM3Day': ('Optimized Biogas (m³/d)', 1), 'methanePct': ('CH₄ Content (%)', 100),
        'feedRate': ('Feed Rate (kg VS/d)', 1), 'temperature': ('Temperature (°C)', 1),
        'ph': ('pH', 1), 'olr': ('OLR (kg VS/m³·d)', 1),
        'h2sBeforePpm': ('H₂S Before Filter (ppm)', 1), 'h2sAfterPpm': ('H₂S After Filter (ppm)', 1),
        'stabilityPct': ('Process Stability (%)', 100),
    }
    rows = []
    for offset, row in enumerate(original):
        if not isinstance(row[0], str) or not row[0].startswith('RUN-H'):
            continue
        normalized = {key: float(row[lookup[column]]) * factor for key, (column, factor) in mapping.items()}
        rows.append(dict(id=row[0], sourceRow=first_row + offset, hrtHours=float(row[lookup['HRT (hours)']]),
                         baselineBiogasM3Day=float(row[lookup['Baseline Biogas (m³/d)']]), **normalized))
    assert len(rows) == 500 and len({r['id'] for r in rows}) == 500
    assert all(r['baselineBiogasM3Day'] == 50 for r in rows)
    hours = np.array([r['hrtHours'] for r in rows])
    y = np.array([[r[key] for key in KEYS] for r in rows])
    assert np.isfinite(y).all() and len(np.unique(hours)) == len(rows)
    # A middle contiguous block is withheld before any model selection. The ten
    # rows on each side are a gap, never used for selection or evaluation fit.
    test = np.arange(200, 300)
    train = np.r_[np.arange(0, 190), np.arange(310, 500)]
    candidates = [dict(name='Mean baseline', kind='mean', alpha=0)]
    for degree in [1, 2, 3, 4, 5]:
        for alpha in [0.001, 0.1, 1.0]:
            candidates.append(dict(name=f'Polynomial degree {degree}, ridge {alpha}', kind='polynomial', degree=degree, alpha=alpha))
    for count in [3, 5, 9, 13]:
        knots = np.linspace(-1, 1, count + 2)[1:-1].tolist()
        for alpha in [0.00001, 0.001, 0.1]:
            candidates.append(dict(name=f'Linear spline {count} knots, ridge {alpha}', kind='linear_spline', knots=knots, alpha=alpha))
    folds = []
    for valid in np.array_split(train, 5):
        selected = train[(train < valid.min() - 10) | (train > valid.max() + 10)]
        folds.append((selected, valid))
    ranking = []
    for config in candidates:
        fold_scores = []
        for fitted, valid in folds:
            estimator = hours_fit(hours[fitted], y[fitted], config)
            prediction = estimator.predict(basis(hours[valid], config))
            fold_scores.append(normalized_mae(y[valid], prediction, y[fitted]))
        ranking.append(dict(config=config, meanNormalizedMae=float(np.mean(fold_scores)), foldScores=fold_scores))
    ranking.sort(key=lambda r: r['meanNormalizedMae'])
    best = ranking[0]['config']
    estimator = hours_fit(hours[train], y[train], best)
    prediction = estimator.predict(basis(hours[test], best))
    base = np.tile(y[train].mean(axis=0), (len(test), 1))
    metrics = scores(y[test], prediction, KEYS, UNITS)
    baseline_metrics = scores(y[test], base, KEYS, UNITS)
    for metric, baseline_metric in zip(metrics, baseline_metrics):
        metric['baselineMae'] = baseline_metric['mae']
    model_score = normalized_mae(y[test], prediction, y[train])
    base_score = normalized_mae(y[test], base, y[train])
    improvement = 100 * (base_score - model_score) / base_score
    limits = [
        'Synthetic trajectory agreement only; not independent plant accuracy or demonstrated HRT reduction.',
        'The 500 rows are an interpolated, noise-augmented expansion of ten source concepts, not 500 independent experiments.',
        'HRT is the only independent model input. Process variables and outputs move together along the supplied research trajectory; independent input effects and feedstock-specific support are unknown.',
        'The source has no feedstock column and no plant measurements. No sensor or equipment control is performed.',
        'The source stability score is a synthetic scenario index, not calibrated uncertainty or a validated safety limit.',
        'The model does not predict production at a baseline measured in weeks. A weeks-to-hours display compares a user baseline with a research target only.',
        'The separate 0.5–5.95 hour extreme-extrapolation workbook is excluded. This model supports only its own 2–24 hour synthetic source.',
        'Candidate selection used development folds only. The 100-row synthetic test block was excluded from fitting and tuning; final deployment fit uses all 500 rows after evaluation.',
    ]
    summary = dict(method='Contiguous 100-row synthetic HRT holdout with 10-row gaps; candidate selection by five blocked development folds',
                   trainRows=len(train), testRows=len(test), metricScope='Agreement with withheld synthetic rows; not plant validation',
                   targets=metrics, improvementPct=float(improvement))
    evaluation = dict(displaySummary=summary, selectedCandidate=best['name'],
                      selectionMetric='Mean per-target MAE divided by each training fold target standard deviation, equally weighted across nine outputs',
                      testIndicesZeroBased=[200, 299], gapIndicesZeroBased=[[190, 199], [300, 309]],
                      testHrtRangeHours=[float(min(hours[test])), float(max(hours[test]))],
                      testSourceIds=[rows[i]['id'] for i in test], meanNormalizedMae=model_score,
                      meanBaselineNormalizedMae=base_score, developmentRanking=ranking,
                      limits=limits, finalFitRows=500)
    # Refit only after the model is selected and the untouched-block estimate is recorded.
    final = hours_fit(hours, y, best)
    coefficients = {key: [float(final.intercept_[j]), *[float(v) for v in final.coef_[j]]] for j, key in enumerate(KEYS)}
    model_basis = {key: value for key, value in best.items() if key in ['kind', 'degree', 'knots']}
    source_meta = dict(file=source['file'], sheet=HOURS_SHEET, sha256=source['sha256'], headerRow=5, firstDataRow=6, lastDataRow=505)
    model = dict(version='hours-research-1.0.0', name='Hours-scale synthetic trajectory model',
                 input=dict(key='hrtHours', min=2, max=24, offset=13, scale=11), basis=model_basis,
                 outputKeys=KEYS, coefficients=coefficients, source=source_meta, fitRows=500,
                 researchOnly=True, validationStatus='SYNTHETIC_ONLY_NOT_PLANT_VALIDATED',
                 derived=dict(methaneM3Day='biogasM3Day * methanePct / 100', electricityKwhDay='methaneM3Day * 9.97 * 0.36'),
                 constants=dict(methaneEnergyKwhM3=9.97, electricalEfficiency=0.36),
                 evaluation=evaluation, limitations=limits)
    # Verify precisely the portable coefficient contract, including knots and edges.
    grid = np.unique(np.r_[np.linspace(2, 24, 2000), hours])
    features = np.column_stack([np.ones(len(grid)), basis(grid, best)])
    portable = features @ np.array([coefficients[key] for key in KEYS]).T
    expected = final.predict(basis(grid, best))
    max_error = float(np.max(np.abs(portable - expected)))
    assert max_error < 1e-9
    assert np.isfinite(portable).all()
    assert (portable[:, 0] > 0).all() and ((portable[:, 1] > 0) & (portable[:, 1] < 100)).all()
    model['parity'] = dict(cases=len(grid), maxAbsoluteError=max_error, tolerance=1e-9, status='PASS')
    write('hours-model.json', model)
    write('hours-data.json', dict(version='hours-source-1.0.0', source=source_meta, rowCount=500,
                                  basis='Synthetic research concepts, interpolated and noise-augmented',
                                  researchOnly=True, feedstock=None, units=dict(zip(KEYS, UNITS)), rows=rows))
    fixtures = [dict(hrtHours=float(h), expected={key: float(v) for key, v in zip(KEYS, p)})
                for h, p in zip(grid[::125], expected[::125])]
    write('hours-parity.json', dict(modelVersion=model['version'], tolerance=1e-9, cases=fixtures))
    write('hours-evaluation.json', evaluation)
    print(json.dumps({'hours': best, 'displaySummary': summary, 'parity': model['parity']}, ensure_ascii=False), flush=True)
    return model


def tabular_candidates(numeric_count, small=False):
    transform = ColumnTransformer([('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), [0]),
                                   ('num', StandardScaler(), list(range(1, numeric_count + 1)))])
    models = [('Mean baseline', DummyRegressor())]
    for alpha in ([0.1, 1, 10, 100] if small else [0.1, 1, 10, 100, 1000]):
        models.append((f'Ridge alpha {alpha}', Ridge(alpha=alpha)))
    for k in ([2, 3] if small else [15, 35]):
        models.append((f'KNN {k}', KNeighborsRegressor(n_neighbors=k, weights='distance')))
    models.append(('Random forest', RandomForestRegressor(n_estimators=80, min_samples_leaf=2 if small else 15,
                                                         max_depth=5 if small else 8, random_state=20261102, n_jobs=1)))
    models.append(('Extra Trees', ExtraTreesRegressor(n_estimators=80, min_samples_leaf=2 if small else 15,
                                                      max_depth=5 if small else 8, random_state=20261102, n_jobs=1)))
    models.append(('Gradient boosting', MultiOutputRegressor(GradientBoostingRegressor(
        n_estimators=80, max_depth=1 if small else 2, min_samples_leaf=2 if small else 10,
        learning_rate=0.05, random_state=20261102))))
    return [(name, make_pipeline(clone(transform), model)) for name, model in models]


def fit_predict(model, x, y, training, testing):
    fitted = clone(model).fit(x[training], y[training])
    return fitted.predict(x[testing])


def day_studies(books):
    archive = json.loads((ROOT / 'ai-workflow/evaluation/model_comparison.json').read_text(encoding='utf-8'))
    book = books[SCADA_FILE]
    header, raw, _ = table(book, 'SCADA_Data', 'Timestamp')
    raw = sorted(raw, key=lambda row: row[0])
    features = ['Feedstock', 'HRT_days', 'OLR', 'Temp_C', 'pH', 'COD_In_mgL', 'VFA_mgL', 'Mixer_RPM']
    targets = ['Gas_Flow_m3h', 'CH4_pct', 'Generator_kW']
    x = np.array([[row[header.index(key)] for key in features] for row in raw], dtype=object)
    y = np.array([[row[header.index(key)] for key in targets] for row in raw], dtype=float)
    assert len(raw) == 1000
    train, test = np.arange(800), np.arange(800, 1000)
    ranking = []
    candidates = tabular_candidates(7)
    for name, model in candidates:
        values = []
        for fit, valid in TimeSeriesSplit(n_splits=4, gap=4).split(train):
            prediction = fit_predict(model, x, y, fit, valid)
            values.append(normalized_mae(y[valid], prediction, y[fit]))
        ranking.append(dict(name=name, meanNormalizedMae=float(np.mean(values)), folds=values))
    ranking.sort(key=lambda item: item['meanNormalizedMae'])
    selected = ranking[0]['name']
    selected_learner = next(item['name'] for item in ranking if item['name'] != 'Mean baseline')
    final_results = {}
    for name in dict.fromkeys([selected, selected_learner, 'Mean baseline']):
        model = next(model for label, model in candidates if label == name)
        predicted = fit_predict(model, x, y, train, test)
        final_results[name] = dict(targets=scores(y[test], predicted, targets, ['m3/hour', '%', 'kW']),
                                   meanNormalizedMae=normalized_mae(y[test], predicted, y[train]))
    scada = dict(source=dict(file=book['file'], sheet='SCADA_Data', sha256=book['sha256']),
                 trainRows=800, testRows=200, selection='Four chronological development folds with a four-row gap inside the first 800 rows',
                 selected=selected, selectedLearner=selected_learner, ranking=ranking, evaluation=final_results,
                 archivedRidge=archive['scada_chronological_holdout']['results']['Ridge regression'],
                 status='EXISTING_ARTIFACT_UNCHANGED',
                 limitations=['This is a synthetic template. The final 200 rows were already used in the archived audit and are not a new independent holdout.',
                              'Model selection here uses only the first 800 rows. Archived and new per-target errors share the nominal 800/200 chronological split.',
                              'A mean baseline beating learned models indicates weak predictive signal; it is not evidence of AI plant improvement.'])
    print(json.dumps({'scadaSelected': selected, 'selectedLearner': selected_learner, 'results': final_results}), flush=True)

    book = books[ANCHOR_FILE]
    header, raw, _ = table(book, '10_Optimization_Scenarios', 'Scenario')
    features = ['Feedstock', 'Temp (°C)', 'pH', 'OLR (kgCOD/m3.d)', 'HRT (days)', 'COD In (mg/L)']
    targets = ['Gas Flow (m3/h) After AI', 'CH4 (%) After AI', 'Generator (kW) After AI']
    x = np.array([[row[header.index(key)] for key in features] for row in raw], dtype=object)
    y = np.array([[row[header.index(key)] for key in targets] for row in raw], dtype=float)
    candidates = tabular_candidates(5, small=True)
    predicted = np.empty_like(y)
    baseline = np.empty_like(y)
    selections = []
    for outer_train, outer_test in LeaveOneOut().split(x):
        ranking = []
        for name, model in candidates:
            inner_prediction = np.empty_like(y[outer_train])
            for local_train, local_test in LeaveOneOut().split(outer_train):
                fit, valid = outer_train[local_train], outer_train[local_test]
                inner_prediction[local_test] = fit_predict(model, x, y, fit, valid)
            ranking.append((normalized_mae(y[outer_train], inner_prediction, y[outer_train]), name, model))
        _, name, selected_model = min(ranking, key=lambda item: item[0])
        predicted[outer_test] = fit_predict(selected_model, x, y, outer_train, outer_test)
        baseline[outer_test] = y[outer_train].mean(axis=0)
        selections.append(dict(heldOutSource=str(raw[int(outer_test[0])][0]), selected=name))
    anchors = dict(source=dict(file=book['file'], sheet='10_Optimization_Scenarios', sha256=book['sha256']),
                   rows=10, method='Nested leave-one-out: each outer test row excluded from candidate selection; inner leave-one-out on nine rows',
                   targets=scores(y, predicted, targets, ['m3/hour', '%', 'kW']), baseline=scores(y, baseline, targets, ['m3/hour', '%', 'kW']),
                   outerSelections=selections, selectionCounts=dict(Counter(item['selected'] for item in selections)),
                   archivedGradientBoosting=archive['optimization_anchor_leave_one_out']['results']['Gradient boosting'],
                   status='EXISTING_ARTIFACT_UNCHANGED',
                   limitations=['Ten scenario rows do not provide independent plant validation or reliable feedstock-specific generalization.',
                                'The archived non-nested leave-one-out result was used for model selection; the nested estimate here is a stricter assessment and not an identical evaluation protocol.',
                                'No deployed artifact is replaced based on these small, synthetic assessments.'])
    write('day-model-evaluation.json', dict(version='research-study-2026-11-02', scada=scada, anchors=anchors,
                                           libraries=dict(numpy=np.__version__, sklearn=sklearn.__version__)))
    print(json.dumps({'anchors': anchors['targets'], 'selected': anchors['selectionCounts']}, ensure_ascii=False), flush=True)
    return scada, anchors


def inventory(books):
    seen_files, seen_sheets = {}, {}
    records = []
    for filename, book in books.items():
        duplicate = seen_files.get(book['sha256'])
        seen_files.setdefault(book['sha256'], filename)
        sheet_records = []
        for sheet in book['sheets']:
            digest = hashlib.sha256(json.dumps(sheet['rows'], sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            sheet_duplicate = seen_sheets.get(digest) if sheet['rows'] else None
            if sheet['rows']:
                seen_sheets.setdefault(digest, f"{filename} / {sheet['name']}")
            sheet_records.append(dict(name=sheet['name'], nonEmptyRows=sheet['row_count'], duplicateOf=sheet_duplicate))
        records.append(dict(file=filename, sha256=book['sha256'], duplicateOf=duplicate, sheets=sheet_records,
                            researchTraining=filename == HOURS_FILE,
                            role='Hours-scale synthetic trajectory training' if filename == HOURS_FILE else
                            'Excluded extreme extrapolation; supporting context only' if 'below6h' in filename else
                            'Day-scale model assessment' if filename in [SCADA_FILE, ANCHOR_FILE] else 'Supporting or duplicated reference data'))
    write('source-inventory.json', dict(files=records, independentPlantMeasurements=0,
                                       note='Duplicate files and repeated sheets are never treated as additional independent observations.'))


def report(model, day=None):
    summary = model['evaluation']['displaySummary']
    lines = ['# Model and dataset research — 2 November 2026', '',
             'The hours-scale service is a synthetic research trajectory, not a plant-performance model. Existing deployed Gradient Boosting and Ridge artifacts remain unchanged.', '',
             '## Hours-scale model', '',
             f"Selected: {model['evaluation']['selectedCandidate']}. The input is HRT alone, from 2 to 24 hours. Other process variables follow the supplied correlated trajectory.", '',
             f"Selection uses blocked development cross-validation. The final evaluation fits {summary['trainRows']} rows, holds out {summary['testRows']} contiguous rows and omits 20 gap rows. The exported research model is then refitted on all 500 rows.", '',
             f"The test block spans {model['evaluation']['testHrtRangeHours'][0]:.2f}–{model['evaluation']['testHrtRangeHours'][1]:.2f} hours. Mean normalized MAE improves {summary['improvementPct']:.2f}% relative to a training-mean baseline on this synthetic block. This is not an improvement over the deployed day-scale models, which predict different data.", '',
             '| Target | Unit | MAE | RMSE | R² | Mean baseline MAE |', '|---|---|---:|---:|---:|---:|']
    for metric in summary['targets']:
        r2 = 'undefined' if metric['r2'] is None else f"{metric['r2']:.4f}"
        lines.append(f"| {metric['key']} | {metric['unit']} | {metric['mae']:.4f} | {metric['rmse']:.4f} | {r2} | {metric['baselineMae']:.4f} |")
    lines += ['', 'Methane volume is biogas × CH₄ fraction. Electricity is methane volume × 9.97 kWh/m³ × 0.36, matching the workbook assumptions. These are derived consistently rather than separately fitted.', '',
              'The workbook contains no feedstock classification. Its synthetic stability index is not a validated safety threshold or calibrated confidence. The separate 0.5–5.95-hour extreme projection is excluded from training.', '',
              '## Data limitations', ''] + [f'- {text}' for text in model['limitations']]
    if day:
        scada, anchors = day
        lines += ['', '## Existing day-scale model assessment', '',
                  f"SCADA candidate selection: {scada['selected']}. Best learned candidate: {scada['selectedLearner']}. The first 800 synthetic rows are used for development; the archived final 200 rows are evaluated once after selection. This holdout was previously seen in the audit and cannot establish new independent validation.", '',
                  '| SCADA model | Gas-flow MAE (m³/h) | Methane-content MAE (%) | Generator-power MAE (kW) |', '|---|---:|---:|---:|']
        for name, result in scada['evaluation'].items():
            lines.append('| ' + name + ' | ' + ' | '.join(f"{m['mae']:.4f}" for m in result['targets']) + ' |')
        old = scada['archivedRidge']
        lines += ['| Archived Ridge | ' + ' | '.join(f"{old[k]['MAE']:.4f}" for k in ['Gas_Flow_m3h', 'CH4_pct', 'Generator_kW']) + ' |', '',
                  'The ten paired anchors are assessed using nested leave-one-out. Each test row is excluded from both fitting and model selection. This stricter assessment is not directly interchangeable with the earlier non-nested model-selection score.', '',
                  '| Ten-anchor target | Nested-selection MAE | Archived Gradient Boosting MAE |', '|---|---:|---:|']
        for metric in anchors['targets']:
            lines.append(f"| {metric['key']} | {metric['mae']:.4f} | {anchors['archivedGradientBoosting'][metric['key']]['MAE']:.4f} |")
        lines += ['', 'No existing artifact is promoted or overwritten. Synthetic-data scores do not establish improved plant accuracy.']
    lines += ['', '## Reproduction', '',
              '`python ai-workflow/src/research_model_study.py --source-dir <folder-containing-original-Excel-files>`', '',
              'Alternatively pass `--workbooks <read-only-workbooks.json>`. The JSON must retain each workbook SHA-256, sheet names and original row preambles. If original files are present at their recorded paths, the script verifies their hashes before training. Direct XLSX import reads cached values using the Python standard library; source spreadsheets are never saved or modified. Required model packages are numpy and scikit-learn (versions recorded in day-model-evaluation.json).', '',
              'The portable model uses x = (HRT hours − 13) / 11. Evaluate its documented basis and coefficient dot products. `hours-parity.json` contains reference predictions. The full 2,000-point range plus source inputs passed coefficient-export parity within 1e-9.', '']
    (OUT / 'MODEL_STUDY.md').write_text('\n'.join(lines), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--workbooks', type=Path)
    source.add_argument('--source-dir', type=Path)
    parser.add_argument('--hours-only', action='store_true')
    args = parser.parse_args()
    loaded = read_workbooks(args.source_dir) if args.source_dir else json.loads(args.workbooks.read_text(encoding='utf-8'))
    books = {book['file']: book for book in loaded}
    for book in loaded:
        original = Path(book['path'])
        if original.exists():
            assert hashlib.sha256(original.read_bytes()).hexdigest() == book['sha256'], f"Source changed: {original.name}"
    inventory(books)
    model = hours_study(books)
    day = None if args.hours_only else day_studies(books)
    report(model, day)


if __name__ == '__main__':
    main()
