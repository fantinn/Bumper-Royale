# BATE BATE — Battle royale de carrinhos

**Jogar online:** https://fantinn.github.io/Bumper-Royale/

O GitHub Pages publica os arquivos da raiz da branch `main`. Novos pushes nessa branch atualizam o jogo automaticamente após a publicação terminar.

Abra **index.html** no Chrome, Edge ou Firefox com WebGL habilitado. Não há build, instalação nem dependências locais. É necessária conexão à internet para carregar Three.js pelo CDN; as fontes têm alternativas locais.

## Jogar

O mapa **Parque do Bairro** é um pavilhão de bate-bate com piso metálico, malha condutora no teto, bandeirinhas, bilheteria, bancos e espectadores. Cada carrinho tem uma haste coletora flexível: a sapata desliza no teto e solta faíscas ao dirigir, com rajadas maiores no boost. Ao cair, o carrinho perde contato e para de produzir faíscas. Os anéis da pista continuam cedendo sobre um fosso de manutenção para preservar o battle royale.

Escolha a quantidade de bots e a dificuldade no menu e clique em **Jogar agora**.

- W / seta para cima: acelerar.
- S / seta para baixo: frear e dar ré.
- A e D / setas laterais: girar.
- Espaço: boost curto, com recarga de três segundos; toques rápidos também são registrados.
- Esc: pausar. Sair da janela também pausa a partida.
- Som: botão no canto superior direito; sintetizado no navegador.

O anel externo pisca e treme quatro segundos antes de cair. A cada 16 segundos, uma faixa de quatro unidades desaparece. Depois da quinta queda, a ilha central permanece por 18 segundos e começa a diminuir continuamente, evitando partidas intermináveis. O último sobrevivente vence. Quedas simultâneas compartilham colocação; se todos caírem, não há vencedor. A tela de derrota aparece após a queda do jogador; jogar novamente inicia uma nova partida.

A direção tem resposta progressiva, aceleração mais rápida e freio dedicado antes de entrar em ré. O movimento visual é interpolado entre passos de física, e a câmera acompanha as curvas suavemente, abrindo o campo de visão com a velocidade e o boost. Batidas fortes e quedas do piso recebem um aviso curto na tela.

Batidas fortes amplificam o impulso em até 1,6×. Acertar enquanto avança com boost acrescenta 30% de força. Após receber um impacto forte, o carrinho desliza por até 0,7 s com aderência e aceleração reduzidas, sem perder a capacidade de girar. Encostões continuam fracos; massa e velocidade ainda influenciam o resultado. Ajuste `impactMultiplier`, `boostImpactMultiplier`, `knockbackDuration`, `knockbackGrip`, `knockbackControl` e `maxCollisionImpulse` em **physics.js** para rebalancear. O limite de impulso evita que colisões em cadeia cresçam sem controle.

## Ajustar

Todos os parâmetros estão em `BumperPhysics.CONFIG`, no início de **physics.js**: `bots`, `difficulty`, `mass`, `acceleration`, `maxSpeed`, `grip`, `restitution`, `boostImpulse`, `boostCooldown`, `phaseSeconds`, `warningSeconds` e `finalSeconds`.

O menu sobrescreve `bots` e `difficulty` ao iniciar. Para mudar os valores padrão do menu ou oferecer outras quantidades, edite as opções `select` em **index.html**. Os perfis `difficultyProfiles` alteram potência e intervalo de reação da IA. Cada bot também recebe agressividade e massa ligeiramente diferentes.

Ao alterar a geometria, mantenha `radius - phases * ringWidth > 0`: essa diferença define o raio da ilha central. A renderização acompanha esses parâmetros.

## Arquitetura

- **index.html**: interface, estilos e scripts clássicos, compatíveis com abertura via `file://`.
- **physics.js**: configuração, entidades, estado, física, colisões, fases e vitória; sem DOM/Three.js.
- **ai.js**: decisões dos bots; gera `{ throttle, steer, boost }`, assim como o teclado.
- **game.js**: Three.js, câmera, partículas, áudio, entrada e interface.
- **pavilion.js**: cenário do parque e altura do teto (`ceilingHeight`); construído apenas uma vez, sem afetar a física.
- **render-utils.js**: agrupamento de geometrias por cores e pool de 128 partículas desenhadas em uma chamada.

## Desempenho

A renderização agrupa cenário, carrocerias e anéis para reduzir chamadas à GPU. Usa iluminação Lambert, sombras de contato simples e partículas reutilizadas; não há sombras dinâmicas nem luzes pontuais. A resolução interna começa limitada a 1 pixel por pixel CSS e a 1,44 milhão de pixels, e se reduz automaticamente até 65% quando a partida permanece lenta. A física continua em passos de 1/60 s e a quantidade de bots é preservada.

O botão **Gráficos: auto / leve** permite forçar resolução de 65% imediatamente em máquinas mais lentas. Ele muda apenas os gráficos, sem reduzir bots ou alterar a velocidade da simulação.

O menu renderiza até 30 FPS; a cena pausada, a tela de resultado e abas ocultas não ficam redesenhando continuamente. Para diagnóstico, abra o jogo com `?perf=1` no final da URL: mostra FPS, chamadas de desenho, triângulos e geometrias alocadas. FPS depende do hardware, tamanho da janela e carga do navegador.

Cada entidade tem `id`, `input`, `state` e dados opcionais de IA. A simulação avança em passos fixos de 1/60 s. Para multiplayer futuro, execute a simulação em um servidor autoritativo, receba inputs validados por ID e replique snapshots aos clientes. A camada visual já está separada, mas rede, sincronização, previsão e lobby ainda precisam ser implementados. Esta versão é local: um jogador e bots.

O projeto não precisa de servidor. Se preferir servir por HTTP com Python instalado: `python -m http.server 8080`, e abra http://localhost:8080.
