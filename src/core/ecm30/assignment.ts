// Leitura dos payloads XStream embutidos no .process (02 §3) e conversão de mecanismos de atribuição (02 §3.3).
const { tokenizeXml, decodeXml } = require('../../bpmn/xmlTokenizer');

export interface Xs { name: string; cls: string; text: string; children: Xs[] }

interface Token { name: string; openEnd: number; closeStart: number; attributeMap: Record<string, { value: string }>; children: Token[] }

/** Lê um payload XStream (já decodificado do atributo EMF). Vazio → null (02 §2.2 regra 4). */
export function parseXs(payload: string | undefined): Xs | null {
  if (!payload) {
    return null;
  }
  if (payload.startsWith('<?xml')) {
    throw new Error('Payload em formato java.beans.XMLDecoder (Studio antigo) não suportado; abra e salve o processo num Studio recente.');
  }
  const convert = (node: Token): Xs => ({
    name: node.name,
    cls: node.attributeMap.class?.value ?? node.name,
    text: node.children.length ? '' : decodeXml(payload.slice(node.openEnd, node.closeStart)),
    children: node.children.map(convert),
  });
  const root: Token | undefined = tokenizeXml(payload).children[0];
  return root ? convert(root) : null;
}

/** Texto do campo `name` (null se ausente, como o XStream faz com null). */
export function field(node: Xs | null | undefined, name: string): string | null {
  return node?.children.find((child) => child.name === name)?.text ?? null;
}

const RETURNS = ['First', 'Last', 'All'];
const onOff = (value: string | null) => (value === 'true' ? 'ON' : 'OFF');

/**
 * `engineAllocationConfiguration` a partir do controller (02 §3.3). `seqOf` resolve o `idNode` do
 * Executor Atividade para a sequence (ausente → literal "null").
 */
export function convertAssignment(ctrl: Xs | null, seqOf: (id: string) => number | undefined): string | null {
  if (!ctrl) {
    return null;
  }
  const f = (name: string) => field(ctrl, name);
  const wrap = (body: string) => `<AssignmentController>${body}</AssignmentController>`;
  switch (ctrl.cls.replace(/^.*\.AssignmentController/, '')) {
    case 'Group':
    case 'PoolGroup': {
      // 02 §3.3: string vazia quando groupId é null.
      const groupId = f('groupId');
      return groupId === null ? '' : wrap(`<Group>${groupId}</Group>`);
    }
    case 'Role':
    case 'PoolRole':
      return wrap(`<Role>${f('roleId') ?? ''}</Role>`);
    case 'Colleague':
      return wrap(`<User>${f('colleagueId') ?? ''}</User>`);
    case 'FormField':
      return wrap(`<FormField>${f('formField') ?? ''}</FormField>`);
    case 'ColleagueGroup':
      return wrap(`<GroupsOf>${f('colleagueId') ?? ''}</GroupsOf><OnlyWorkGroup>${onOff(f('onlyWorkGroup'))}</OnlyWorkGroup>`
        + `<IncludeCommunityGroups>${onOff(f('includeCommunityGroups'))}</IncludeCommunityGroups>`);
    case 'ExecutorMechanism':
      return wrap(`<BaseActivity>${seqOf(f('idNode') ?? '') ?? 'null'}</BaseActivity>`
        + `<Returns>${RETURNS[parseInt(f('returns') ?? '0', 10)] ?? 'First'}</Returns>`);
    case 'Associated': {
      const items = ctrl.children.find((child) => child.name === 'controllers')?.children ?? [];
      const inner = items.map((item) => `<ControlXML TypeAssociated="${field(item, 'mechanismName') ?? ''}">${convertAssignment(item, seqOf) ?? ''}</ControlXML>`);
      return `<AssociatedController ConditionAssociated="${f('type') ?? 'OR'}">${inner.join('')}</AssociatedController>`;
    }
    default:
      return ''; // Custom (e classes desconhecidas): buffer vazio
  }
}
