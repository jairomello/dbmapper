# Proposal

## Why

A organização automática `Em estrela` posiciona os cards em anéis cujo raio é
calculado a partir do *maior* card da camada. No modelo real (Axiis, 108
tabelas, uma tabela com 2.671 px de altura) o resultado salvo tem **43.610 ×
44.444 px**: o `minZoom` (0.2) não enquadra o diagrama, o minimapa vira uma
mancha e a leitura fica inviável. `Em grade` também é ruim: 3 colunas fixas
geram 780 × 9.180 px.

## What Changes

- **Organização compacta**: o layout `Em estrela` passa a distribuir as tabelas
  em **anéis discretos ao redor do hub** (células ordenadas por distância), com
  a tabela de maior grau no centro e as demais ocupando as células mais próximas
  na ordem dos níveis de relacionamento; tabelas sem relação continuam em faixa
  lateral. O resultado é compacto (ordem de grandeza do grid equivalente) e
  continua determinístico e sem sobreposição.
- **Grade adaptativa**: `Em grade` calcula o número de colunas a partir da
  quantidade de tabelas (grade aproximadamente quadrada) em vez de 3 colunas
  fixas.
- **Mais amplitude de zoom**: `minZoom` do canvas cai de `0.2` para `0.05`
  (4× mais), permitindo enquadrar modelos grandes com "Ajustar à tela".
- **Minimapa mais legível**: maior, com nós destacando a seleção/busca e máscara
  mais suave, para dar noção de posição mesmo em modelos grandes.

**Non-goals:** layout por força/`d3-force`, novos algoritmos além de
grade/estrela, redimensionar/recolher cards, mudar o contrato de posições
(chave por nome, mesmo `PUT /diagram`) e alterar o layout já salvo de projetos
existentes sem ação do usuário.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `diagram-layout`: requisito novo de **compactação** do layout automático
  (extensão limitada, anéis por nível, sem sobreposição, determinismo) e grade
  adaptativa.
- `diagram-canvas`: requisito novo de **amplitude de zoom** e **legibilidade do
  minimapa** para modelos grandes.

## Impact

- **Frontend**: `apps/web/src/diagram/auto-layout.ts` (reescrita do
  `layoutStar`, `adaptiveColumns`), `DiagramCanvas.tsx` (`minZoom`, minimapa,
  chamada da grade adaptativa) e testes.
- **Backend/dados**: nenhum — as posições continuam no `PUT /diagram`; projetos
  com layout antigo permanecem como estão até aplicar uma nova organização.
- **Testes**: unitários de compactação/sobreposição no fixture real de 108
  tabelas, componente do canvas (minZoom/minimapa) e conferência no e2e.
