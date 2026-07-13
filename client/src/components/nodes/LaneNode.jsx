import React from 'react';
import { useEditorStore } from '../../store.js';

const LANE_FILLS = ['rgba(247,249,252,0.9)', 'rgba(240,244,249,0.9)'];

export default function LaneNode({ data, selected }) {
  const { band, index, width } = data;
  const setMap = useEditorStore((s) => s.setMap);
  const isReal = band.id !== '__none__';

  const toggleCollapse = (e) => {
    e.stopPropagation();
    if (!isReal) return;
    setMap((map) => ({
      ...map,
      lanes: map.lanes.map((l) => (l.id === band.id ? { ...l, collapsed: !l.collapsed } : l)),
    }));
  };

  return (
    <div
      className={`lane-node ${band.collapsed ? 'collapsed' : ''}`}
      style={{
        width,
        height: band.height,
        background: band.color || LANE_FILLS[index % 2],
        outline: selected ? '2px solid var(--primary)' : 'none',
      }}
    >
      <div className="lane-header" style={{ width: band.collapsed ? 'auto' : 40, padding: band.collapsed ? '0 10px' : 0 }}>
        <span className="lane-title">
          {band.name}
          {band.locked ? ' 🔒' : ''}
        </span>
      </div>
      {isReal && (
        <button
          className="btn sm ghost"
          style={{ position: 'absolute', right: 6, top: 6, fontSize: 11 }}
          onClick={toggleCollapse}
          title={band.collapsed ? 'Expand swimlane' : 'Collapse swimlane'}
        >
          {band.collapsed ? '▸ expand' : '▾'}
        </button>
      )}
    </div>
  );
}
