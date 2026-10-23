// Fontes de WorkflowProcessEvent (09 §7): scripts e literais ao lado do .process.
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Ecm30Event { eventId: string; content: string }

const LITERALS: [string, string][] = [['pt_BR', 'POR_LITERALS'], ['es', 'ESP_LITERALS'], ['en_US', 'ENG_LITERALS']];

/** UTF-8 sem BOM; se não for UTF-8 válido, ISO-8859-1. */
function readText(file: string): string {
  const bytes = fs.readFileSync(file);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = bytes.toString('latin1');
  }
  return text.startsWith('\uFEFF') ? text.slice(1) : text;
}

/** `workflow/diagrams/<base>.process` → eventos de `workflow/scripts` e `workflow/literals`, ordenados por eventId. */
export function readEcm30Events(processPath: string): Ecm30Event[] {
  const base = path.basename(processPath, '.process');
  const workflow = path.dirname(path.dirname(processPath));
  const events = new Map<string, string>();
  const scripts = path.join(workflow, 'scripts');
  for (const name of fs.existsSync(scripts) ? fs.readdirSync(scripts) : []) {
    const eventId = name.slice(base.length + 1, -'.js'.length);
    if (name.startsWith(`${base}.`) && name.endsWith('.js') && eventId) {
      events.set(eventId, readText(path.join(scripts, name)));
    }
  }
  // Literal sobrescreve script de mesmo eventId (ex.: <base>.POR_LITERALS.js) — regra observada na saída do Studio.
  for (const [locale, eventId] of LITERALS) {
    const file = path.join(workflow, 'literals', `${base}_${locale}.properties`);
    if (fs.existsSync(file)) {
      events.set(eventId, readText(file));
    }
  }
  return [...events].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([eventId, content]) => ({ eventId, content }));
}
