# Treino de Digitação — pratique digitação em português, com acentos (HTML + JavaScript)

A maioria dos sites de treino de digitação é pensada para o inglês: não tem acento, não tem “ç” e às vezes nem entende as teclas mortas do teclado brasileiro. Este treino foi feito para o português, com palavras, frases e textos acentuados de verdade, e funciona tanto no teclado ABNT2 quanto no US-Internacional.

**Acesse online:** https://micdog22.github.io/treino-de-digitacao/

## Recursos
- Quatro modos: **palavras** (sorteadas de uma lista de 420 palavras comuns), **frases** (62 frases), **textos** (12 parágrafos curtos) e **números e símbolos** (preços, datas, horários, porcentagens e continhas).
- Duração por tempo (15, 30, 60 ou 120 segundos) ou por quantidade de palavras (10, 25, 50 ou 100).
- Acentos de verdade: a digitação é lida pelo campo de texto (eventos `input`, `beforeinput` e de composição), então as teclas mortas do ABNT2 e do US-Internacional geram “á”, “ã”, “ç” normalmente. Tudo é normalizado em NFC antes da comparação.
- Destaque ao vivo de acertos e erros, com cursor, e PPM e precisão atualizados enquanto você digita.
- Resultado com PPM, precisão, erros, consistência, os caracteres em que você mais errou e um mapa de calor dos erros no teclado ABNT2.
- Opção **ignorar acentos** para quem está começando (“a” vale por “á”, “c” por “ç”).
- Recorde por configuração e histórico dos últimos 50 treinos, guardados só no seu navegador.
- Todos os textos foram escritos para o projeto e seguem a ortografia atual (ideia, voo, tranquilo, heroico).

## Como usar
1. Escolha o modo e a duração.
2. Comece a digitar: o tempo começa na primeira tecla e o Backspace corrige.
3. No fim, veja o resultado. A tecla `Esc` sorteia um novo texto a qualquer momento.

Para acentuar: no ABNT2, aperte a tecla do acento e depois a letra (´ + a = á, ~ + a = ã). No US-Internacional, o acento agudo fica no apóstrofo (' + a = á) e o “ç” sai com ' + c.

## Como as medidas são calculadas
- **PPM** (palavras por minuto): caracteres corretos no texto digitado ÷ 5 ÷ minutos. O 5 é o tamanho padrão de uma “palavra” em testes de digitação, o que permite comparar textos diferentes.
- **Precisão**: teclas certas ÷ teclas digitadas. Um erro corrigido com Backspace continua contando, porque a tecla errada foi apertada.
- **Consistência**: 100% menos o coeficiente de variação do número de teclas em cada segundo. Ritmo constante dá 100%; pausas e arrancadas derrubam o valor.
- No mapa do teclado, uma letra acentuada conta na tecla da letra e na tecla do acento (agudo e grave na tecla ´, til e circunflexo na tecla ~).

## Como rodar localmente
```bash
python3 -m http.server 8000
```
Na pasta do projeto, rode o comando acima e abra http://localhost:8000 (os módulos ES não carregam via `file://`).

## Testes
```bash
npm test
```
(ou `node --test`). Os testes cobrem as contas de PPM, precisão e consistência, a comparação de acentos (NFC e NFD), o modo “ignorar acentos”, o gerador de textos com semente, o histórico e a qualidade dos textos (sem espaço duplo, frases terminando com pontuação, ortografia atual).

## Contribuindo
Issues e pull requests são bem-vindos. Sugestões de frases e textos também: eles precisam ser originais, sem aspas nem acentos soltos.

## Licença
MIT — veja [LICENSE](LICENSE).
