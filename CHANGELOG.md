# Changelog

## 1.2.0 — 2026-03-22

### Fixed
- Fixed some ontology modules displaying "x.0.0" instead of names due to version numbers in ontology IRIs
- Toolbar error indicator now keeps the ontology's own colour with a red `!` badge, instead of replacing the dot colour with red

### Improved
- Ontology errors are now clickable — shows a popup with selectable error messages, source URLs, and per-module retry buttons
- Toolbar tooltip includes error count when modules have failed
- Ontology Manager now takes over the full content area instead of stacking above the entity tree
- Added "Ontology Settings" header to the manage view for clearer context
- Disabled OS autocorrect/spellcheck on the search box
- Version number shown in the header

## 1.1.0 — 2026-03-05

### Added
- Class inheritance diagrams
- Property details and implementation view
- Facet-to-class linking via OWL restrictions
- Splash screen with loading progress
- Deep links to load specific ontology groups (e.g., `#?groups=UCO,CASE,SOLVE-IT`)
- Reordered details in the right-hand pane

## 1.0.0 — 2026-03-01

Initial release.

- Ontology browser for classes, properties, and individuals
- Support for official (UCO/CASE), community, and custom ontologies
- Ontology Manager with enable/disable toggles and custom ontology support
- Force refresh for all ontologies
- Facet views with wording updates
- Entity search with type filtering
- Navigation history with back/forward and breadcrumbs
- Light/dark theme toggle
- Toolbar with group status indicators
- Web manifest and app icons
- Custom domain support
- GitHub Pages deployment
