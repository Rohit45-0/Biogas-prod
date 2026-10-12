import type { NextConfig } from "next";
import path from "node:path";
import {realpathSync} from "node:fs";

// Vercel cannot package both a directory symlink and files nested under that link.
const nativeRoot=path.relative(process.cwd(),realpathSync("node_modules/onnxruntime-node")).split(path.sep).join("/");

const nextConfig: NextConfig = {
  serverExternalPackages:["onnxruntime-node"],
  outputFileTracingIncludes:{"/api/ml/*":[
    "./ai-workflow/models/onnx/*.onnx",
    ...(process.platform==="linux"?[`./${nativeRoot}/bin/napi-v6/linux/x64/*`]:[]),
  ]},
  outputFileTracingExcludes:process.platform==="linux"?{"/*":[
    "./node_modules/onnxruntime-node/bin/napi-v6/win32/**/*",
    "./node_modules/onnxruntime-node/bin/napi-v6/darwin/**/*",
    "./node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**/*",
    "./node_modules/.pnpm/onnxruntime-node*/node_modules/onnxruntime-node/bin/napi-v6/win32/**/*",
    "./node_modules/.pnpm/onnxruntime-node*/node_modules/onnxruntime-node/bin/napi-v6/darwin/**/*",
    "./node_modules/.pnpm/onnxruntime-node*/node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**/*",
  ]}:{},
};

export default nextConfig;
