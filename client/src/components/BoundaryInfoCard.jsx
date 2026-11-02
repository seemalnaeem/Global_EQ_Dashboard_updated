import { LuX } from 'react-icons/lu';

// Themed, closable info card for a clicked boundary feature (national,
// provincial, district, or tehsil polygon). Built entirely from the real MVT
// feature attributes via utils/attributeConfig.js; never fabricates a field.
export default function BoundaryInfoCard({ card, onClose }) {
  if (!card) return null;

  return (
    <div className="boundary-card">
      <div className="boundary-card-header">
        <span className="boundary-card-eyebrow">{card.layerLabel}</span>
        <button
          type="button"
          className="icon-button-plain"
          onClick={onClose}
          aria-label="Close feature details"
        >
          <LuX size={14} />
        </button>
      </div>

      <div className="boundary-card-title">{card.title}</div>
      {card.subtitle && <div className="boundary-card-subtitle">{card.subtitle}</div>}

      {card.rows.length > 0 && (
        <dl className="boundary-card-fields">
          {card.rows.map((row) => (
            <div className="boundary-card-field" key={row.key}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="boundary-card-tags">
        <span className="tag-chip">{card.layerLabel}</span>
        {card.code && <span className="tag-chip">{card.code}</span>}
      </div>
    </div>
  );
}
