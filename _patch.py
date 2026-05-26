import sys

f = r'c:\Users\storage\Desktop\Storage-Inventory\frontend\src\pages\mapping\MapEditor.jsx'
with open(f, 'r', encoding='utf-8') as fh:
    c = fh.read()

changes = 0

# ── Replacement 5+6+7: canvas container div + svg + background rect ──
old = (
    '        <div className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm min-h-0">\n'
    '          {loading ? (\n'
    '            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading\u00e2\u20ac\u00a6</div>\n'
    '          ) : (\n'
    '            <svg ref={svgRef} width={CANVAS_W} height={CANVAS_H}\n'
    '              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}\n'
    '              style={{ display: "block", touchAction: "none", cursor: "default", maxWidth: "100%" }}\n'
    '              onPointerMove={onPointerMove}\n'
    '              onPointerUp={onPointerUp}\n'
    '              onClick={onCanvasClick}\n'
    '            >\n'
    '              {/* Grid */}\n'
    '              <defs>\n'
    '                <pattern id="ed-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">\n'
    '                  <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#e5e7eb" strokeWidth="0.5" />\n'
    '                </pattern>\n'
    '              </defs>\n'
    '              <rect width={CANVAS_W} height={CANVAS_H} fill="url(#ed-grid)" />'
)
new = (
    '        <div className="flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm min-h-0"\n'
    '          style={{ cursor: isPanning ? "grabbing" : "default" }}>\n'
    '          {loading ? (\n'
    '            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading\u00e2\u20ac\u00a6</div>\n'
    '          ) : (\n'
    '            <svg ref={svgRef} width="100%" height="100%"\n'
    '              viewBox={`${pan.x} ${pan.y} ${CANVAS_W} ${CANVAS_H}`}\n'
    '              style={{ display: "block", touchAction: "none", minHeight: 500 }}\n'
    '              onPointerMove={onPointerMove}\n'
    '              onPointerUp={onPointerUp}\n'
    '            >\n'
    '              {/* Grid */}\n'
    '              <defs>\n'
    '                <pattern id="ed-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">\n'
    '                  <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#e5e7eb" strokeWidth="0.5" />\n'
    '                </pattern>\n'
    '              </defs>\n'
    '              {/* Oversized background - pointer events handle canvas panning */}\n'
    '              <rect ref={bgRef}\n'
    '                x={pan.x - 5000} y={pan.y - 5000}\n'
    '                width={CANVAS_W + 10000} height={CANVAS_H + 10000}\n'
    '                fill="url(#ed-grid)"\n'
    '                style={{ cursor: isPanning ? "grabbing" : "grab" }}\n'
    '                onPointerDown={startPan}\n'
    '                onPointerMove={onBgMove}\n'
    '                onPointerUp={endPan}\n'
    '              />'
)
if old in c:
    c = c.replace(old, new, 1)
    changes += 1
    print('Replacement 5+6+7 (canvas/svg/bgRect): OK')
else:
    print('Replacement 5+6+7 FAILED - searching for parts...')
    print('  overflow-auto:', 'overflow-auto' in c)
    print('  onClick={onCanvasClick}:', 'onClick={onCanvasClick}' in c)
    idx = c.find('overflow-auto')
    if idx >= 0:
        print('  Content around overflow-auto:')
        print(repr(c[idx-10:idx+400]))


# ── Replacement 8: Legend ──
# Find existing legend section
import re
m = re.search(r'(\s+\{/\* .{0,10}Legend .{0,10}\*/\})\s*\n(\s+<div className="mt-3 flex flex-wrap gap-3 shrink-0">)', c)
if m:
    # Replace the div opening
    old8 = '      {/* \u00e2\u94\u80\u00e2\u94\u80 Legend \u00e2\u94\u80\u00e2\u94\u80 */}\n      <div className="mt-3 flex flex-wrap gap-3 shrink-0">'
    new8 = '      {/* \u00e2\u94\u80\u00e2\u94\u80 Legend + keyboard hints \u00e2\u94\u80\u00e2\u94\u80 */}\n      <div className="mt-3 flex flex-wrap items-center gap-3 shrink-0">'
    if old8 in c:
        c = c.replace(old8, new8, 1)
        changes += 1
        print('Replacement 8a (legend div): OK')
    else:
        print('Replacement 8a not found, trying broader...')
        print(repr(m.group(0)))
else:
    # Try a simpler approach - find the closing of the legend div
    idx = c.find('"mt-3 flex flex-wrap gap-3 shrink-0"')
    if idx >= 0:
        old8 = '"mt-3 flex flex-wrap gap-3 shrink-0"'
        new8 = '"mt-3 flex flex-wrap items-center gap-3 shrink-0"'
        c = c.replace(old8, new8, 1)
        changes += 1
        print('Replacement 8a (legend class): OK')
    else:
        print('Replacement 8a FAILED')

# Add keyboard hints after the map() legend items
old8b = (
    '        ))}\n'
    '      </div>'
)
# Find last occurrence of this (should be legend closing)
idx = c.rfind(old8b)
if idx >= 0:
    # Make sure it's near the legend by checking preceding context
    ctx = c[max(0,idx-200):idx+20]
    if 'MAT_FILL' in ctx or 'mt-3' in ctx:
        new8b = (
            '        ))}\n'
            '        <span className="text-xs text-gray-400 ml-auto">\n'
            '          Drag canvas to pan &nbsp;&middot;&nbsp; <kbd className="font-mono bg-gray-100 px-1 rounded">R</kbd> rotate'
            ' &nbsp;&middot;&nbsp; <kbd className="font-mono bg-gray-100 px-1 rounded">Esc</kbd> deselect'
            ' &nbsp;&middot;&nbsp; <kbd className="font-mono bg-gray-100 px-1 rounded">Del</kbd> delete\n'
            '        </span>\n'
            '      </div>'
        )
        c = c[:idx] + new8b + c[idx+len(old8b):]
        changes += 1
        print('Replacement 8b (kbd hints): OK')
    else:
        print('Replacement 8b: last </div> not near legend')
        print('Context:', repr(ctx))
else:
    print('Replacement 8b FAILED')

print(f'\nTotal changes applied: {changes}')

with open(f, 'w', encoding='utf-8') as fh:
    fh.write(c)
print('File written.')
