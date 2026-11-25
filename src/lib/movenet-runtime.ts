import '@tensorflow/tfjs-backend-cpu/dist/base';
import '@tensorflow/tfjs-backend-webgl/dist/base';
import { registerKernel } from '@tensorflow/tfjs-core';

// Thunder v4 inference only. Include the backend helpers used by compound ops,
// as well as the kernels corresponding directly to nodes in model.json.
import { addConfig as cpuAdd } from '@tensorflow/tfjs-backend-cpu/dist/kernels/Add';
import { argMaxConfig as cpuArgMax } from '@tensorflow/tfjs-backend-cpu/dist/kernels/ArgMax';
import { castConfig as cpuCast } from '@tensorflow/tfjs-backend-cpu/dist/kernels/Cast';
import { concatConfig as cpuConcat } from '@tensorflow/tfjs-backend-cpu/dist/kernels/Concat';
import { depthwiseConv2dNativeConfig as cpuDepthwise } from '@tensorflow/tfjs-backend-cpu/dist/kernels/DepthwiseConv2dNative';
import { expandDimsConfig as cpuExpand } from '@tensorflow/tfjs-backend-cpu/dist/kernels/ExpandDims';
import { floorDivConfig as cpuFloorDiv } from '@tensorflow/tfjs-backend-cpu/dist/kernels/FloorDiv';
import { fusedConv2DConfig as cpuConv } from '@tensorflow/tfjs-backend-cpu/dist/kernels/FusedConv2D';
import { fusedDepthwiseConv2DConfig as cpuFusedDepthwise } from '@tensorflow/tfjs-backend-cpu/dist/kernels/FusedDepthwiseConv2D';
import { gatherNdConfig as cpuGather } from '@tensorflow/tfjs-backend-cpu/dist/kernels/GatherNd';
import { identityConfig as cpuIdentity } from '@tensorflow/tfjs-backend-cpu/dist/kernels/Identity';
import { multiplyConfig as cpuMultiply } from '@tensorflow/tfjs-backend-cpu/dist/kernels/Multiply';
import { packConfig as cpuPack } from '@tensorflow/tfjs-backend-cpu/dist/kernels/Pack';
import { realDivConfig as cpuDiv } from '@tensorflow/tfjs-backend-cpu/dist/kernels/RealDiv';
import { reshapeConfig as cpuReshape } from '@tensorflow/tfjs-backend-cpu/dist/kernels/Reshape';
import { resizeBilinearConfig as cpuResize } from '@tensorflow/tfjs-backend-cpu/dist/kernels/ResizeBilinear';
import { sigmoidConfig as cpuSigmoid } from '@tensorflow/tfjs-backend-cpu/dist/kernels/Sigmoid';
import { sqrtConfig as cpuSqrt } from '@tensorflow/tfjs-backend-cpu/dist/kernels/Sqrt';
import { squaredDifferenceConfig as cpuSquaredDiff } from '@tensorflow/tfjs-backend-cpu/dist/kernels/SquaredDifference';
import { subConfig as cpuSub } from '@tensorflow/tfjs-backend-cpu/dist/kernels/Sub';
import { unpackConfig as cpuUnpack } from '@tensorflow/tfjs-backend-cpu/dist/kernels/Unpack';

import { addConfig as glAdd } from '@tensorflow/tfjs-backend-webgl/dist/kernels/Add';
import { argMaxConfig as glArgMax } from '@tensorflow/tfjs-backend-webgl/dist/kernels/ArgMax';
import { castConfig as glCast } from '@tensorflow/tfjs-backend-webgl/dist/kernels/Cast';
import { concatConfig as glConcat } from '@tensorflow/tfjs-backend-webgl/dist/kernels/Concat';
import { depthwiseConv2dNativeConfig as glDepthwise } from '@tensorflow/tfjs-backend-webgl/dist/kernels/DepthwiseConv2dNative';
import { expandDimsConfig as glExpand } from '@tensorflow/tfjs-backend-webgl/dist/kernels/ExpandDims';
import { floorDivConfig as glFloorDiv } from '@tensorflow/tfjs-backend-webgl/dist/kernels/FloorDiv';
import { fromPixelsConfig as glFromPixels } from '@tensorflow/tfjs-backend-webgl/dist/kernels/FromPixels';
import { fusedConv2DConfig as glConv } from '@tensorflow/tfjs-backend-webgl/dist/kernels/FusedConv2D';
import { fusedDepthwiseConv2DConfig as glFusedDepthwise } from '@tensorflow/tfjs-backend-webgl/dist/kernels/FusedDepthwiseConv2D';
import { gatherNdConfig as glGather } from '@tensorflow/tfjs-backend-webgl/dist/kernels/GatherNd';
import { identityConfig as glIdentity } from '@tensorflow/tfjs-backend-webgl/dist/kernels/Identity';
import { multiplyConfig as glMultiply } from '@tensorflow/tfjs-backend-webgl/dist/kernels/Multiply';
import { packConfig as glPack } from '@tensorflow/tfjs-backend-webgl/dist/kernels/Pack';
import { realDivConfig as glDiv } from '@tensorflow/tfjs-backend-webgl/dist/kernels/RealDiv';
import { reshapeConfig as glReshape } from '@tensorflow/tfjs-backend-webgl/dist/kernels/Reshape';
import { resizeBilinearConfig as glResize } from '@tensorflow/tfjs-backend-webgl/dist/kernels/ResizeBilinear';
import { sigmoidConfig as glSigmoid } from '@tensorflow/tfjs-backend-webgl/dist/kernels/Sigmoid';
import { sqrtConfig as glSqrt } from '@tensorflow/tfjs-backend-webgl/dist/kernels/Sqrt';
import { squaredDifferenceConfig as glSquaredDiff } from '@tensorflow/tfjs-backend-webgl/dist/kernels/SquaredDifference';
import { subConfig as glSub } from '@tensorflow/tfjs-backend-webgl/dist/kernels/Sub';
import { unpackConfig as glUnpack } from '@tensorflow/tfjs-backend-webgl/dist/kernels/Unpack';

[
	cpuAdd,
	cpuArgMax,
	cpuCast,
	cpuConcat,
	cpuDepthwise,
	cpuExpand,
	cpuFloorDiv,
	cpuConv,
	cpuFusedDepthwise,
	cpuGather,
	cpuIdentity,
	cpuMultiply,
	cpuPack,
	cpuDiv,
	cpuReshape,
	cpuResize,
	cpuSigmoid,
	cpuSqrt,
	cpuSquaredDiff,
	cpuSub,
	cpuUnpack,
	glAdd,
	glArgMax,
	glCast,
	glConcat,
	glDepthwise,
	glExpand,
	glFloorDiv,
	glFromPixels,
	glConv,
	glFusedDepthwise,
	glGather,
	glIdentity,
	glMultiply,
	glPack,
	glDiv,
	glReshape,
	glResize,
	glSigmoid,
	glSqrt,
	glSquaredDiff,
	glSub,
	glUnpack
].forEach(registerKernel);

export { ready, getBackend, tidy, browser, expandDims, type Tensor } from '@tensorflow/tfjs-core';
export { loadGraphModel } from '@tensorflow/tfjs-converter';
