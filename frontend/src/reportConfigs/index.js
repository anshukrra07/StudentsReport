import attendance from './attendance';
import marks      from './marks';
import backlogs   from './backlogs';
import cgpa       from './cgpa';
import risk       from './risk';
import toppers    from './toppers';

/**
 * CFGS — one entry per report page.
 *
 * To add a 7th report type:
 *   1. Create src/reportConfigs/myreport.js
 *   2. Add `import myreport from './myreport';` above
 *   3. Add `myreport,` to the export below
 *   4. Add the route in App.js (or it auto-routes via CFGS[page])
 *
 * That's it — no other file needs touching.
 */
const CFGS = { attendance, marks, backlogs, cgpa, risk, toppers };
export default CFGS;
