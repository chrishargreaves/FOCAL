const UCO_BASE = 'https://raw.githubusercontent.com/ucoProject/UCO/develop/ontology';
const CASE_BASE = 'https://raw.githubusercontent.com/casework/CASE/develop/ontology';
const SOLVEIT_BASE = 'https://raw.githubusercontent.com/SOLVE-IT-DF/solve-it-ontology/main';
const CAC_BASE = 'https://raw.githubusercontent.com/Project-VIC-International/CAC-Ontology/main/ontology';
const UCO_AI_BASE = 'https://raw.githubusercontent.com/vulnmaster/Unified-Cyber-Ontology-Extensions-AI-Generated/main/ontology';
const CASE_AI_BASE = 'https://raw.githubusercontent.com/vulnmaster/CASE-Ontology-Extensions-AI-Generated/main/ontology';

// ── Colours ──
const UCO_COLOR = '#2E8B57';     // sea green
const CASE_COLOR = '#3CB371';    // medium sea green
const SOLVEIT_COLOR = '#E5A630'; // amber/yellow
const CAC_COLOR = '#D4851F';     // warm orange
const UCO_AI_COLOR = '#7B68EE';  // medium slate blue
const CASE_AI_COLOR = '#9370DB'; // medium purple

// ── Categories ──
export const ONTOLOGY_CATEGORIES = {
  official: { label: 'Official', description: 'CASE/UCO standard ontologies' },
  community: { label: 'Community', description: 'Third-party ontologies extending CASE/UCO' },
  custom: { label: 'Custom', description: 'User-added ontologies' },
};

function uco(id, name, path) {
  return { id: `uco-${id}`, name: `UCO ${name}`, url: `${UCO_BASE}/${path}`, color: UCO_COLOR, enabled: true, group: 'UCO', category: 'official', issuesUrl: 'https://github.com/ucoProject/UCO/issues/new/choose' };
}
function caseOnt(id, name, path) {
  return { id: `case-${id}`, name: `CASE ${name}`, url: `${CASE_BASE}/${path}`, color: CASE_COLOR, enabled: true, group: 'CASE', category: 'official', issuesUrl: 'https://github.com/casework/CASE/issues/new/choose' };
}
function solveit(id, name, path) {
  return { id: `solveit-${id}`, name: `SOLVE-IT ${name}`, url: `${SOLVEIT_BASE}/${path}`, color: SOLVEIT_COLOR, enabled: false, group: 'SOLVE-IT', category: 'community' };
}
function cac(id, name) {
  return { id: `cac-${id}`, name: `CAC ${name}`, url: `${CAC_BASE}/cacontology-${id}.ttl`, color: CAC_COLOR, enabled: false, group: 'CAC', category: 'community' };
}
function ucoAi(id, name, file) {
  return { id: `uco-ai-${id}`, name: `UCO-AI ${name}`, url: `${UCO_AI_BASE}/${file}`, color: UCO_AI_COLOR, enabled: false, group: 'UCO-AI', category: 'community' };
}
function caseAi(id, name, file) {
  return { id: `case-ai-${id}`, name: `CASE-AI ${name}`, url: `${CASE_AI_BASE}/${file}`, color: CASE_AI_COLOR, enabled: false, group: 'CASE-AI', category: 'community' };
}

const CAC_MODULES = [
  cac('core',                        'Core'),
  cac('ai-generated-content',        'AI Generated Content'),
  cac('analyst-wellbeing',           'Analyst Wellbeing'),
  cac('asset-forfeiture',            'Asset Forfeiture'),
  cac('athletic-exploitation',       'Athletic Exploitation'),
  cac('case-management',             'Case Management'),
  cac('custodial',                   'Custodial'),
  cac('detection',                   'Detection'),
  cac('educational-exploitation',    'Educational Exploitation'),
  cac('extremist-enterprises',       'Extremist Enterprises'),
  cac('forensics',                   'Forensics'),
  cac('grooming',                    'Grooming'),
  cac('gufo-integration-strategy',   'gUFO Integration'),
  cac('hotlines-core',               'Hotlines Core'),
  cac('institutional-exploitation',  'Institutional Exploitation'),
  cac('international',               'International'),
  cac('investigation-coordination',  'Investigation Coordination'),
  cac('law-enforcement-corruption',  'Law Enforcement Corruption'),
  cac('legal-harmonization',         'Legal Harmonization'),
  cac('multi-jurisdiction',          'Multi Jurisdiction'),
  cac('partnerships',                'Partnerships'),
  cac('physical-evidence',           'Physical Evidence'),
  cac('platform-infrastructure',     'Platform Infrastructure'),
  cac('platforms',                   'Platforms'),
  cac('prevention',                  'Prevention'),
  cac('production',                  'Production'),
  cac('recruitment-networks',        'Recruitment Networks'),
  cac('sentencing',                  'Sentencing'),
  cac('sex-offender-registry',       'Sex Offender Registry'),
  cac('sex-trafficking',             'Sex Trafficking'),
  cac('sextortion',                  'Sextortion'),
  cac('soe',                         'SOE'),
  cac('specialized-units',           'Specialized Units'),
  cac('stranger-abduction',          'Stranger Abduction'),
  cac('street-recruitment',          'Street Recruitment'),
  cac('synthesis',                   'Synthesis'),
  cac('tactical',                    'Tactical'),
  cac('taskforce',                   'Taskforce'),
  cac('temporal-gufo',               'Temporal gUFO'),
  cac('training',                    'Training'),
  cac('undercover',                  'Undercover'),
  cac('us-ncmec',                    'US NCMEC'),
  cac('usa-federal-law',             'USA Federal Law'),
  cac('usa-legislative',             'USA Legislative'),
  cac('victim-impact',               'Victim Impact'),
];

export const DEFAULT_ONTOLOGIES = [
  // ── Official: UCO (18 modules) ──
  uco('core',          'Core',          'uco/core/core.ttl'),
  uco('observable',    'Observable',    'uco/observable/observable.ttl'),
  uco('action',        'Action',        'uco/action/action.ttl'),
  uco('analysis',      'Analysis',      'uco/analysis/analysis.ttl'),
  uco('configuration', 'Configuration', 'uco/configuration/configuration.ttl'),
  uco('identity',      'Identity',      'uco/identity/identity.ttl'),
  uco('location',      'Location',      'uco/location/location.ttl'),
  uco('marking',       'Marking',       'uco/marking/marking.ttl'),
  uco('pattern',       'Pattern',       'uco/pattern/pattern.ttl'),
  uco('role',          'Role',          'uco/role/role.ttl'),
  uco('time',          'Time',          'uco/time/time.ttl'),
  uco('tool',          'Tool',          'uco/tool/tool.ttl'),
  uco('types',         'Types',         'uco/types/types.ttl'),
  uco('victim',        'Victim',        'uco/victim/victim.ttl'),
  uco('vocabulary',    'Vocabulary',    'uco/vocabulary/vocabulary.ttl'),
  uco('master',        'Master',        'uco/master/uco.ttl'),
  uco('co',            'Collections',   'co/co.ttl'),
  uco('owl',           'OWL',           'owl/owl.ttl'),

  // ── Official: CASE (3 modules) ──
  caseOnt('investigation', 'Investigation', 'investigation/investigation.ttl'),
  caseOnt('vocabulary',    'Vocabulary',    'vocabulary/vocabulary.ttl'),
  caseOnt('master',        'Master',        'master/case.ttl'),

  // ── Community: SOLVE-IT (9 ontology modules + 1 KB) ──
  solveit('core',                   'Core',                   'solve_it_core.ttl'),
  solveit('analysis',               'Analysis',               'solve_it_analysis.ttl'),
  solveit('observable',             'Observable',             'solve_it_observable.ttl'),
  solveit('observable-acquisition', 'Observable Acquisition', 'solve_it_observable_acquisition.ttl'),
  solveit('observable-search',      'Observable Search',      'solve_it_observable_search.ttl'),
  solveit('observable-shapes',      'Observable Shapes',      'solve_it_observable_shapes.ttl'),
  solveit('observable-timeline',    'Observable Timeline',    'solve_it_observable_timeline.ttl'),
  solveit('sqlite',                 'SQLite',                 'solve_it_sqlite.ttl'),
  solveit('tool-profile',           'Tool Profile',           'solve_it_tool_profile.ttl'),
  solveit('kb',                     'Knowledge Base',         'docs/data/solve-it-kb.ttl'),

  // ── Community: UCO AI Extensions (vulnmaster) ──
  ucoAi('action',           'Action',           'action-ai-ext.ttl'),
  ucoAi('action-shapes',    'Action Shapes',    'action-ai-ext-shapes.ttl'),
  ucoAi('observable',       'Observable',       'observable-ai-ext.ttl'),
  ucoAi('observable-shapes','Observable Shapes', 'observable-ai-ext-shapes.ttl'),
  ucoAi('tool',             'Tool',             'tool-ai-ext.ttl'),

  // ── Community: CASE AI Extensions (vulnmaster) ──
  caseAi('investigation',       'Investigation',       'investigation-ai-ext.ttl'),
  caseAi('investigation-shapes','Investigation Shapes', 'investigation-ai-ext-shapes.ttl'),

  // ── Community: ProjectVic CAC Ontology (45 modules) ──
  ...CAC_MODULES,
];

export const BADGE_ABBREVIATIONS = {
  UCO: 'UCO',
  CASE: 'CASE',
  'SOLVE-IT': 'SOLVEIT',
  CAC: 'CAC',
  'UCO-AI': 'U-AI',
  'CASE-AI': 'C-AI',
};
