export function hrtChange(beforeHours:number,afterHours:number){
  const changeHours=Number((afterHours-beforeHours).toFixed(2));
  return {changeHours,changeDays:Number((changeHours/24).toFixed(4)),direction:changeHours>0?"increase":changeHours<0?"decrease":"unchanged"};
}
export function hrtChangeLabel(beforeHours:number,afterHours:number){
  const {changeHours,direction}=hrtChange(beforeHours,afterHours);
  return `${changeHours>0?"+":""}${changeHours.toLocaleString(undefined,{maximumFractionDigits:2})} hours (${direction})`;
}
