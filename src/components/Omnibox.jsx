import { useRef, useCallback } from 'react';
import { useOntologyStore } from '../store/ontologyStore.js';
import { searchEntities } from '../utils/search.js';

export default function Omnibox() {
  const searchQuery = useOntologyStore(s => s.searchQuery);
  const setSearchQuery = useOntologyStore(s => s.setSearchQuery);
  const highlightedIndex = useOntologyStore(s => s.highlightedIndex);
  const setHighlightedIndex = useOntologyStore(s => s.setHighlightedIndex);
  const selectEntity = useOntologyStore(s => s.selectEntity);
  const entityIndex = useOntologyStore(s => s.entityIndex);
  const sources = useOntologyStore(s => s.sources);
  const typeFilter = useOntologyStore(s => s.typeFilter);
  const inputRef = useRef(null);

  const enabledSourceIds = new Set(sources.filter(s => s.enabled).map(s => s.id));

  const handleKeyDown = useCallback((e) => {
    const results = searchEntities(entityIndex, searchQuery, enabledSourceIds, typeFilter);
    const count = results.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(Math.min(highlightedIndex + 1, count - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(Math.max(highlightedIndex - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[highlightedIndex]) {
        selectEntity(results[highlightedIndex].iri);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSearchQuery('');
      inputRef.current?.blur();
    }
  }, [entityIndex, searchQuery, enabledSourceIds, typeFilter, highlightedIndex, setHighlightedIndex, selectEntity, setSearchQuery]);

  return (
    <div className="omnibox" role="combobox" aria-expanded="true" aria-haspopup="listbox">
      <input
        ref={inputRef}
        className="omnibox-input"
        type="text"
        placeholder="Search classes, properties, individuals..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Search ontology entities"
        aria-autocomplete="list"
      />
    </div>
  );
}
