import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SheetPageView } from './SheetPageView'
import { ZOOM_MIN, ZOOM_MAX, zoomIn, zoomOut } from '../utils/zoom'

// 악보 보기의 악보 한 쪽: 처음에는 쪽 전체가 화면에 들어오게 맞추고(zoom 1), 키우면 스크롤로 움직여 본다
// zoom·onZoom은 부모가 갖는다 (키보드 +/−와 같이 쓰려고)
export default function FitSheet({ view, song, shareToken, pin, zoom, onZoom, reserveTop = 0, reserveBottom = 0 }) {
  const boxRef = useRef(null)
  const [box, setBox] = useState({ w: 0, h: 0, dock: 0 })
  const [nat, setNat] = useState(null) // 악보 이미지 원래 크기

  // 화면 크기와 필기 도구 줄 높이를 잰다
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => {
      const dock = el.querySelector('.annot-dock')
      setBox({ w: el.clientWidth, h: el.clientHeight, dock: dock ? dock.offsetHeight : 0 })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [view?.src])

  // 트랙패드 오므리기·Ctrl+휠로 확대·축소 (브라우저 전체 확대 대신)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      onZoom((z) => (e.deltaY < 0 ? Math.min(ZOOM_MAX, z * 1.05) : Math.max(ZOOM_MIN, z / 1.05)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onZoom])

  const sameImg = nat && nat.src === view?.src
  const availW = Math.max(1, box.w - 16)
  const availH = Math.max(1, box.h - box.dock - reserveTop - reserveBottom - 16)
  const fit = sameImg ? Math.min(availW / nat.w, availH / nat.h) : 0
  const width = sameImg ? Math.round(nat.w * fit * zoom) : null
  const widthZoom = sameImg ? availW / (nat.w * fit) : 1 // 가로를 꽉 채우는 배율

  const imgStyle = width
    ? { width: `${width}px`, height: 'auto', maxWidth: 'none', display: 'block', userSelect: 'none' }
    : { width: '100%', height: 'auto', display: 'block', userSelect: 'none', visibility: 'hidden' } // 크기 재기 전

  return (
    <>
      <div ref={boxRef} className="fit-sheet" data-zoomed={zoom > 1 ? '1' : undefined}>
        <div className="fit-sheet-inner" style={{ paddingTop: 8 + reserveTop, paddingBottom: reserveBottom }}>
          <SheetPageView view={view} song={song} shareToken={shareToken} pin={pin} dark
            imgStyle={imgStyle}
            onImgLoad={(e) => setNat({ src: view.src, w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 })} />
        </div>
      </div>
      {sameImg && (
        <div className="zoom-bar" role="group" aria-label="악보 확대·축소">
          <button type="button" onClick={() => onZoom(zoomOut(zoom))} disabled={zoom <= ZOOM_MIN} aria-label="축소">−</button>
          <button type="button" className={zoom === 1 ? 'is-on' : ''} onClick={() => onZoom(1)} title="쪽 전체 보기">{zoom === 1 ? '전체' : `${Math.round(zoom * 100)}%`}</button>
          <button type="button" onClick={() => onZoom(Math.min(ZOOM_MAX, Math.max(1, widthZoom)))} title="가로를 꽉 채우기">↔</button>
          <button type="button" onClick={() => onZoom(zoomIn(zoom))} disabled={zoom >= ZOOM_MAX} aria-label="확대">＋</button>
        </div>
      )}
    </>
  )
}
