const VOCABULARY_REVIEW_KEY = "pt-word-review";

function spellingAnswer(value) {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-PT");
}

function queueVocabularyErrors(parts, answers, dictionary) {
  const review = load(VOCABULARY_REVIEW_KEY, {});
  const words = new Map();
  for (const part of parts) {
    const word = dictionary[part.term];
    const input = answers[part.id] ?? "";
    const outcome = evaluateHgpPart(part, input);
    if (!word || !outcome.answer) continue;

    const matchesWord = normaliseHgpAnswer(input) === normaliseHgpAnswer(word.pt);
    const exactWord = spellingAnswer(input) === spellingAnswer(word.pt);
    const accentError = !part.options && matchesWord && !exactWord;
    if (outcome.correct && !accentError) continue;
    const answeredWithOtherTerm = Object.entries(dictionary).some(([id, other]) =>
      id !== part.term && normaliseHgpAnswer(other.pt) === outcome.answer);
    const spelling = !part.options && !answeredWithOtherTerm;

    const pending = review[part.term] ?? {};
    const choices = Object.entries(dictionary)
      .filter(([id, other]) => id !== part.term && other.explanation_pt !== word.explanation_pt)
      .sort(([a, first], [b, second]) => {
        const relevance = (id, candidate) => Number(part.options?.includes(candidate.pt)) * 2
          + Number(id.split(".")[0] === part.term.split(".")[0]);
        return relevance(b, second) - relevance(a, first);
      })
      .slice(0, 2)
      .map(([, other]) => other.explanation_pt);
    review[part.term] = spelling ? { ...pending, spelling: true } : { ...pending, meaning: choices };
    words.set(part.term, { id: part.term, ...word });
  }
  if (!words.size) return;
  saveWords([...words.values()], false);
  save(VOCABULARY_REVIEW_KEY, review);
}

const VOCABULARY_ROUND_SIZE = 6;
const VOCABULARY_FORMATS = ["term", "meaning", "pair", "term", "letter", "pair"];

function shuffleVocabulary(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function vocabularyRound(words, pending, seen) {
  const fresh = words.filter(word => !seen.has(word.id));
  const available = fresh.length ? fresh : words;
  if (!fresh.length) seen.clear();

  return shuffleVocabulary(available)
    .sort((a, b) => Number(Boolean(pending[b.id])) - Number(Boolean(pending[a.id])))
    .slice(0, VOCABULARY_ROUND_SIZE)
    .map((word, position) => {
      const review = pending[word.id] ?? {};
      const type = review.meaning ? "meaning" : review.spelling ? "letter" : VOCABULARY_FORMATS[position];
      const alternatives = shuffleVocabulary(words.filter(other =>
        other.id !== word.id && other.pt !== word.pt && other.explanation_pt !== word.explanation_pt
      ));
      return vocabularyTask(word, type, alternatives, Array.isArray(review.meaning) ? review.meaning : []);
    });
}

function vocabularyTask(word, type, alternatives, pendingDefinitions) {
  const distractors = [...new Set([...pendingDefinitions, ...alternatives.map(other => other.explanation_pt)])].slice(0, 2);
  if (type === "term" && alternatives.length) {
    return {
      word, key: "meaning", distractors, prompt: "Que palavra corresponde à definição?",
      clue: word.explanation_pt, russianClue: word.explanation_ru, expected: word.pt,
      options: shuffleVocabulary([word.pt, ...[...new Set(alternatives.map(other => other.pt))].slice(0, 2)])
    };
  }
  if (type === "meaning" && distractors.length) {
    return {
      word, key: "meaning", distractors, prompt: `O que significa «${word.pt}»?`,
      expected: word.explanation_pt, options: shuffleVocabulary([word.explanation_pt, ...distractors])
    };
  }
  if (type === "pair" && distractors.length) {
    const matches = Math.random() < .5;
    return {
      word, key: "meaning", distractors, prompt: `Esta definição corresponde a «${word.pt}»?`,
      clue: matches ? word.explanation_pt : distractors[0],
      expected: matches ? "Sim" : "Não", options: ["Sim", "Não"]
    };
  }

  const letters = Array.from(word.pt);
  const accented = letters.findIndex(letter => /\p{M}/u.test(letter.normalize("NFD")));
  const eligible = letters.map((letter, index) => /\p{L}/u.test(letter) ? index : -1).filter(index => index >= 0);
  const index = accented >= 0 ? accented : eligible[Math.floor(Math.random() * eligible.length)];
  const expected = letters[index];
  const plain = expected.normalize("NFD").replace(/\p{M}/gu, "");
  const pool = [...new Set([plain, `${plain}\u0301`.normalize("NFC"), ...Array.from("aeioursm")])]
    .filter(letter => letter !== expected);
  const choices = accented >= 0 ? [plain, ...shuffleVocabulary(pool.filter(letter => letter !== plain)).slice(0, 1)]
    : shuffleVocabulary(pool).slice(0, 2);
  letters[index] = "_";
  return {
    word, key: "spelling", prompt: "Que letra falta?",
    clue: letters.join(""), hint: word.explanation_pt, russianClue: word.ru,
    expected, options: shuffleVocabulary([expected, ...choices])
  };
}

function renderVocabularyTrainer(seen = new Set()) {
  const words = load("pt-words", []).filter(word => word.pt && word.explanation_pt);
  const round = vocabularyRound(words, load(VOCABULARY_REVIEW_KEY, {}), seen);
  let position = 0;
  let correct = 0;

  page.innerHTML = `<a href="#dicionario">Voltar ao dicionário</a>
    ${heading("Treinar vocabulário")}
    <div id="vocabulary-card" class="panel"></div>`;
  const card = $("#vocabulary-card");

  function renderCard(focus = false) {
    if (position >= round.length) {
      card.innerHTML = round.length
        ? `<h2 tabindex="-1">Ronda concluída!</h2><p>Acertaste em ${correct} de ${round.length}.</p>
           <button class="primary" type="button">Próxima ronda</button>`
        : "<p>Guarda palavras de uma aula para começares a treinar.</p>";
      card.querySelector("button")?.addEventListener("click", () => {
        renderVocabularyTrainer(seen);
        $("#page-heading").focus();
      });
      if (focus) card.querySelector("h2")?.focus();
      return;
    }

    const { word, key, distractors, prompt, clue, hint, russianClue, expected, options } = round[position];
    const input = options.map((option, index) => `<label><input type="radio" name="answer" value="${index}" required>
      <span>${safe(option)}</span></label>`).join("");
    const meter = round.map((_, index) =>
      `<span${index < position ? " data-done" : index === position ? " data-current" : ""}></span>`
    ).join("");

    card.innerHTML = `<p class="muted">Palavra ${position + 1} de ${round.length}</p>
      <div class="vocab-meter" style="--round-size:${round.length}" aria-hidden="true">${meter}</div>
      <form id="vocabulary-answer">
        <fieldset class="question">
          <legend tabindex="-1"><strong>${safe(prompt)}</strong></legend>
          ${clue ? `<p class="vocab-clue">${safe(clue)}</p>` : ""}
          ${hint ? `<p>${safe(hint)}</p>` : ""}
          ${russian(russianClue)}
          ${input}
          <button class="primary" type="submit">Verificar</button>
        </fieldset>
      </form>
      <div id="vocabulary-feedback" role="status"></div>
      <button type="button" id="vocabulary-next" hidden>${position + 1 < round.length ? "Continuar" : "Ver resultado"}</button>`;

    const form = card.querySelector("form");
    const next = card.querySelector("#vocabulary-next");
    if (focus) form.querySelector("legend").focus();

    form.addEventListener("submit", event => {
      event.preventDefault();
      const answer = new FormData(form).get("answer");
      if (answer === null || !answer.trim()) return;
      const ok = options[Number(answer)] === expected;
      if (ok) correct += 1;

      const review = load(VOCABULARY_REVIEW_KEY, {});
      const pending = { ...review[word.id] };
      if (ok) delete pending[key];
      else pending[key] = distractors ?? true;
      if (Object.keys(pending).length) review[word.id] = pending;
      else delete review[word.id];
      save(VOCABULARY_REVIEW_KEY, review);

      const feedback = card.querySelector("#vocabulary-feedback");
      feedback.innerHTML = `<p><strong>${ok ? "Correto." : "Revê esta palavra."}</strong> ${safe(word.pt)} — ${safe(word.explanation_pt)}</p>
        ${russian(word.explanation_ru)}`;
      form.querySelector("fieldset").disabled = true;
      next.hidden = false;
      next.focus();
    });

    next.addEventListener("click", () => {
      seen.add(word.id);
      position += 1;
      renderCard(true);
    });
  }

  renderCard();
}
