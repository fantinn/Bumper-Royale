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
- Espaço: boost curto, com recarga de quatro segundos.
- Esc: pausar. Sair da janela também pausa a partida.
- Som: botão no canto superior direito; sintetizado no navegador.

O anel externo pisca e treme cinco segundos antes de cair. A cada 20 segundos, uma faixa de quatro unidades desaparece. Depois da quinta queda, a ilha central permanece por 28 segundos e começa a diminuir continuamente, evitando partidas intermináveis. O último sobrevivente vence. Quedas simultâneas compartilham colocação; se todos caírem, não há vencedor. A tela de derrota aparece após a queda do jogador; jogar novamente inicia uma nova partida.

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

Cada entidade tem `id`, `input`, `state` e dados opcionais de IA. A simulação avança em passos fixos de 1/60 s. Para multiplayer futuro, execute a simulação em um servidor autoritativo, receba inputs validados por ID e replique snapshots aos clientes. A camada visual já está separada, mas rede, sincronização, previsão e lobby ainda precisam ser implementados. Esta versão é local: um jogador e bots.

O projeto não precisa de servidor. Se preferir servir por HTTP com Python instalado: `python -m http.server 8080`, e abra http://localhost:8080.
