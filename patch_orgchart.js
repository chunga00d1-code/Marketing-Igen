import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'src', 'components', 'hr', 'OrgChartTab.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to LF to ensure matches work consistently across OSes
content = content.replace(/\r\n/g, '\n');

// 1. Add FUNCTIONAL_CATEGORIES and helper above component declaration
const target1 = 'export default function OrgChartTab({';
const replacement1 = fs.readFileSync(path.join(__dirname, 'scratch', 'replacement1.txt'), 'utf8').replace(/\r\n/g, '\n');

if (!content.includes(target1)) {
  console.error("Could not find target 1");
  process.exit(1);
}
content = content.replace(target1, replacement1);

// 2. Add isDetailModalOpen states below selectedEmp state
const target2 = '  const [selectedEmp, setSelectedEmp] = useState<EmployeeNode | null>(null);\n\n  // Add Employee Modal States';
const replacement2 = fs.readFileSync(path.join(__dirname, 'scratch', 'replacement2.txt'), 'utf8').replace(/\r\n/g, '\n');

if (!content.includes(target2)) {
  console.error("Could not find target 2");
  process.exit(1);
}
content = content.replace(target2, replacement2);

// 3. Replace renderBranch implementation
const target3Start = '  // Recursive Branch rendering component helper';
const target3End = '        {/* Children Render recursive block */}';
const idx3Start = content.indexOf(target3Start);
const idx3End = content.indexOf(target3End);

if (idx3Start === -1 || idx3End === -1 || idx3Start >= idx3End) {
  console.error("Could not find target 3 bounds");
  process.exit(1);
}
const replacement3 = fs.readFileSync(path.join(__dirname, 'scratch', 'replacement3.txt'), 'utf8').replace(/\r\n/g, '\n');
content = content.substring(0, idx3Start) + replacement3.trimEnd() + '\n\n' + content.substring(idx3End);

// 4. Replace sidebar detail card block
const target4Start = '          {/* Sidebar View employee card detail panel */}';
const target4End = '          {/* Interactive Tree viewport diagram */}';
const idx4Start = content.indexOf(target4Start);
const idx4End = content.indexOf(target4End);

if (idx4Start === -1 || idx4End === -1 || idx4Start >= idx4End) {
  console.error("Could not find target 4 bounds");
  process.exit(1);
}
const replacement4 = fs.readFileSync(path.join(__dirname, 'scratch', 'replacement4.txt'), 'utf8').replace(/\r\n/g, '\n');
content = content.substring(0, idx4Start) + replacement4.trimEnd() + '\n\n' + content.substring(idx4End);

// 5. Add Detail & Edit Modal at the bottom
const target5 = '      {/* ADD EMPLOYEE MODAL */}\n      {isAddModalOpen && (';
const replacement5 = fs.readFileSync(path.join(__dirname, 'scratch', 'replacement5.txt'), 'utf8').replace(/\r\n/g, '\n');

if (!content.includes(target5)) {
  console.error("Could not find target 5");
  process.exit(1);
}
content = content.replace(target5, replacement5);

fs.writeFileSync(filePath, content, 'utf8');
console.log("OrgChartTab.tsx successfully patched!");
process.exit(0);
