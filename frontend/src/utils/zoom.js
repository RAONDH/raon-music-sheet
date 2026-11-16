// 악보 보기 배율: 1 = 쪽 전체가 화면에 들어옴
export const ZOOM_MIN = 1
export const ZOOM_MAX = 4
const ZOOM_STEP = 1.25
export const zoomIn = (z) => Math.min(ZOOM_MAX, Math.round(z * ZOOM_STEP * 100) / 100)
export const zoomOut = (z) => Math.max(ZOOM_MIN, Math.round((z / ZOOM_STEP) * 100) / 100)
