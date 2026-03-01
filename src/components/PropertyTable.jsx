export default function PropertyTable({ properties, entityIndex, selectEntity }) {
  if (properties.length === 0) return null;

  return (
    <table className="property-table">
      <thead>
        <tr>
          <th>Property</th>
          <th>Type / Range</th>
          <th>Card.</th>
        </tr>
      </thead>
      <tbody>
        {properties.map((p, i) => (
          <tr key={p.name + i}>
            <td className="prop-name">
              {p.nameIri && entityIndex?.has(p.nameIri) ? (
                <span className="clickable-iri" onClick={() => selectEntity(p.nameIri)}>
                  {p.name}
                </span>
              ) : (
                p.name
              )}
            </td>
            <td className="prop-type">
              {p.typeIri && entityIndex?.has(p.typeIri) ? (
                <span className="clickable-iri" onClick={() => selectEntity(p.typeIri)}>
                  {p.type}
                </span>
              ) : (
                p.type || '\u2014'
              )}
            </td>
            <td className="prop-card">{p.cardinality || '\u2014'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
