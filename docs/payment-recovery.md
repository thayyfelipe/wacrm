# Recuperação de compras — regra comum

Status: núcleo de decisão implementado e testado; ainda não conectado aos envios ou à produção.
Branch: `feat/payment-recovery-rules`.

## Regra funcional

- Configuração por conta, plataforma, loja e produto: ativação, modelo e minutos de espera para Pix e carrinho. Não presumir 30 minutos para todas as plataformas. Intervalo proposto: 1 a 1440 minutos.
- Calcular a espera usando a data original do evento da plataforma; repetição de webhook não reinicia o relógio.
- Eventos entram em um modelo comum, após validação da assinatura por cada adaptador.
- Mesmo checkout: Pix tem prioridade sobre carrinho. Carrinho não é um segundo envio se já houve tentativa de Pix.
- Limite adicional proposto: uma tentativa de recuperação por comprador/produto em 24 horas, compartilhado entre conexões duplicadas da mesma loja. A chave deve usar telefone internacional normalizado com HMAC; não usar nome como identidade. Isso é uma proteção de frequência, não uma prova de que dois checkouts são a mesma compra.
- Compra paga, cancelada, reembolsada ou contestada cancela a recuperação. Eventos antigos de pendência não reabrem a compra.
- Antes de enviar, consultar a plataforma. Apenas retorno explícito de pendência autoriza. Ausência de webhook pago, erro, timeout, falta de credencial ou status desconhecido mantém o envio bloqueado.
- Verificação deve corresponder à conta, plataforma, loja, produto e compra. Deve ocorrer depois do prazo de espera e estar recente (até 60 segundos).
- Reserva atômica de envio precisa validar a revisão atual da compra e o limite de contato. Um pagamento recebido entre a consulta externa e a reserva invalida a reserva.
- Uma mensagem aceita pela Meta ou uma tentativa ambígua nunca é repetida automaticamente. Entrega será acompanhada pelo ID real da Meta.
- Não é possível garantir atomicidade entre pagamento na plataforma e envio à Meta: uma compra pode ser paga imediatamente após a última consulta. O sistema reduz essa janela; não promete eliminá-la.

## Auditoria do código atual

- Zouti: Pix e carrinho enviam imediatamente dentro do webhook. A correlação original persiste apenas o objeto do evento, não `order_session_id`; este precisa ser incorporado antes de deduplicar carrinho e pedido com IDs diferentes.
- Zouti: `Order` e `AbandonedCart` possuem `order_session_id` no exemplo oficial. `PAYMENT_PAID` é objeto Payment com `order_id`; não confundir pagamento individual/split com pedido totalmente pago. A confirmação do pedido deve prevalecer.
- Kiwify: o endpoint atual aceita apenas `order_approved`/`paid` e registra vendas; Pix e carrinho ainda não passam por um pipeline de recuperação.
- Não há clientes de consulta de pedidos/vendas nem credenciais de API por plataforma na integração atual. O token/segredo de webhook não substitui credenciais de API.
- Não há fila de recuperação. As crons existentes de automações e fluxos não devem ser alteradas para mudar suas regras; criar processamento específico de recuperação.

## Próximos componentes (ainda não implementados)

1. Adaptadores autenticados: normalização, consulta atual de pagamento, correlação de sessão/pedido/carrinho e indicação de capacidade. Não inventar endpoint Zouti.
2. Configurações e credenciais criptografadas por conta/loja, em tabelas separadas com acesso restrito; painel administrativo para cadastrá-las. Sem credenciais por cliente em variáveis de ambiente.
3. Caixa de entrada idempotente de eventos e estado comum de compras, com unicidade entre conexões duplicadas. Chaves de evento devem ter namespace de loja/plataforma.
4. Fila persistente com data de execução e estado `aguardando`, `verificando`, `bloqueado`, `reservado`, `aceito`, `cancelado`, `falha`, `incerto`. Nunca usar setTimeout ou manter requisição HTTP aberta por minutos.
5. Reserva transacional por compra e comprador/produto, com versão e cancelamento por pagamento. Sem retentativa cega após possível envio à Meta.
6. Endpoint de cron próprio autenticado, com lote limitado e travas para chamadas concorrentes. Confirmar agendador e segredo antes de ativar.
7. UI dos minutos e histórico com motivo: pago, aguardando prazo, aguardando consulta, produto divergente, contato recente, falha ou entrega.
8. Migração aditiva e RLS por conta; migração de configurações existentes sem importar eventos antigos como novos disparos. Ativação explícita apenas após verificar acesso à API.

## Dependências para concluir

- Zouti: documentação oficial e acesso ao endpoint que consulta o pedido atual, autenticação, escopos e retorno. É necessário confirmar como localizar compra/estado do carrinho pela sessão. A documentação fornecida descreve webhooks, não uma API de consulta de pedidos.
- Kiwify: credenciais da API por loja, cadastradas por canal seguro no painel a ser implementado; confirmar formato real de Pix/carrinho e correlação. A API pública documenta consulta de vendas autenticada via OAuth e `x-kiwify-account-id`.
- Não publicar a mudança do fluxo sem estes requisitos. As automações imediatas atuais permanecem em produção até a nova versão ser aprovada.

## Fontes auditadas

- https://ajuda.zouti.com.br/pt-br/articles/9740997-como-configurar-webhook
- https://docs.kiwify.com.br/api-reference/general
- https://kiwify.notion.site/Webhooks-pt-br-c77eb84be10c42e6bb97cd391bca9dce

## Testes do núcleo

15 testes cobrem prazo exato, webhook duplicado, pagamento fora de ordem, estados terminais, prioridade Pix/carrinho, tentativa ambígua, limite de contato, isolamento entre contas/lojas/produtos/compras, verificação expirada e configuração inválida. Esses testes não substituem integração com banco, concorrência do worker e consulta real às plataformas.
