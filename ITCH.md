# Publicar no itch.io

## 1. Gerar o pacote

```
powershell -ExecutionPolicy Bypass -File scripts/build-itch.ps1
```

Isso cria `dist/bate-bate-itch.zip`, com o `index.html` na raiz do zip (exigência do itch).

## 2. Criar a página

1. Entre em https://itch.io → **Upload new project**.
2. **Kind of project:** HTML.
3. **Uploads:** envie `dist/bate-bate-itch.zip` e marque **This file will be played in the browser**.
4. **Embed options:**
   - Viewport: **1280 × 720**
   - Marque **Mobile friendly** (orientação: Landscape) e **Fullscreen button**.
   - Deixe **Automatically start on page load** desmarcado (o jogo já tem menu).
5. **Pricing:** Free ou "No payments", ou **$0 or donate** para aceitar doações.
6. Preencha os textos abaixo, envie 3–5 screenshots (uma por mapa) e uma capa de 630 × 500.
7. Salve como **Draft**, teste na própria página e depois mude para **Public**.

Para atualizar depois: gere o zip de novo e substitua o arquivo em **Uploads** (ou use o `butler push` do itch).

O jogo carrega o Three.js pelo CDN cdnjs; o itch permite isso, mas o jogador precisa estar online.

## Textos da página

**Título:** BATE BATE — Battle Royale de Carrinhos

**Short description (tagline):** Bata, empurre e seja o último carrinho na pista — enquanto o chão desmorona.

**Descrição:**

> BATE BATE é um battle royale de carrinhos de bate-bate. Até 24 carrinhos, um sobrevivente.
>
> O chão vai caindo aos pedaços e o único jeito de vencer é jogar todo mundo para fora antes que você caia junto.
>
> **4 arenas, 4 jeitos de jogar**
> - 🎡 **Parque do Bairro** — o clássico: os anéis caem de fora para dentro.
> - ⛸️ **Rinque Congelado** — gelo puro. Frear é só uma sugestão.
> - 🌃 **Carrossel Neon** — a pista gira e tem bumpers de fliperama.
> - ⚓ **Doca do Porto** — o cais cai em fatias aleatórias.
>
> **Rivais com personalidade:** Tia Neide 👵 joga na retranca, Zé Turbo 🚀 vive no boost e Mestre Kiko 🥋 vai te caçar a partida inteira. E todos eles provocam quando te derrubam.
>
> **Power-ups:** ⚡ recarga de boost, 🔨 modo pesado e 🌀 onda de choque.
>
> Suba de nível, libere cores novas e bata o seu recorde em cada mapa.
>
> **Controles:** WASD/setas para dirigir · Espaço para boost · Esc para pausar · No celular: joystick + botão de boost.

**Genre:** Action · **Tags:** battle-royale, bumper-cars, arcade, party, 3d, physics, casual, brazil, singleplayer, mobile

**Classificação:** sem violência; adequado para todas as idades.
