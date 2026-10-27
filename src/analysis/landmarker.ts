import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { poseFromMatrix } from './pose';
import type { Point, Pose } from './types';

export type Detection = { faces: number; landmarks: Point[] | null; pose: Pose | null; width: number; height: number };

const base = import.meta.env.BASE_URL;
const instances: Partial<Record<'IMAGE' | 'VIDEO', Promise<FaceLandmarker>>> = {};

async function create(mode: 'IMAGE' | 'VIDEO'): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: `${base}models/face_landmarker.task`, delegate },
    runningMode: mode,
    numFaces: 2,
    outputFacialTransformationMatrixes: true,
    outputFaceBlendshapes: false,
  });
  try {
    return await FaceLandmarker.createFromOptions(fileset, options('GPU'));
  } catch {
    return FaceLandmarker.createFromOptions(fileset, options('CPU'));
  }
}

export function getLandmarker(mode: 'IMAGE' | 'VIDEO'): Promise<FaceLandmarker> {
  instances[mode] ??= create(mode).catch((e: unknown) => {
    delete instances[mode];
    throw e;
  });
  return instances[mode]!;
}

type Result = ReturnType<FaceLandmarker['detect']>;

function toDetection(r: Result, width: number, height: number): Detection {
  const first = r.faceLandmarks[0];
  const matrix = r.facialTransformationMatrixes?.[0];
  return {
    faces: r.faceLandmarks.length,
    landmarks: first ? first.map((p) => ({ x: p.x * width, y: p.y * height, z: p.z * width })) : null,
    pose: matrix ? poseFromMatrix(matrix.data) : null,
    width,
    height,
  };
}

export async function detectImage(source: HTMLCanvasElement | HTMLImageElement | ImageBitmap): Promise<Detection> {
  const lm = await getLandmarker('IMAGE');
  return toDetection(lm.detect(source), source.width, source.height);
}

export async function detectVideoFrame(video: HTMLVideoElement, ts: number): Promise<Detection> {
  const lm = await getLandmarker('VIDEO');
  return toDetection(lm.detectForVideo(video, ts), video.videoWidth, video.videoHeight);
}
