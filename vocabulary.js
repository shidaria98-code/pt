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

function vocabularyRound(words, pending) {
  return words.flatMap(word => {
    const review = pending[word.id] ?? {};
    const tasks = [];
    if (review.meaning) tasks.push({ word, type: "meaning", distractors: review.meaning });
    if (review.spelling) tasks.push({ word, type: "spelling" });
    if (!tasks.length) tasks.push({ word, type: "spelling" });
    return tasks.map(task => ({ ...task, priority: Boolean(review[task.type]) }));
  }).sort((left, right) => Number(right.priority) - Number(left.priority));
}

function renderVocabularyTrainer() {
  const words = load("pt-words", []).filter(word => word.pt && word.explanation_pt);
  const round = vocabularyRound(words, load(VOCABULARY_REVIEW_KEY, {}));
  let position = 0;
  let correct = 0;

  page.innerHTML = `<a href="#dicionario">Voltar ao dicionário</a>
    ${heading("Treinar vocabulário")}
    <div id="vocabulary-card" class="panel"></div>`;
  const card = $("#vocabulary-card");

  function renderCard(focus = false) {
    if (position >= round.length) {
      card.innerHTML = round.length
        ? `<h2 tabindex="-1">Treino concluído</h2><p>Resultado: ${correct}/${round.length}.</p>
           <button type="button">Treinar outra vez</button>`
        : "<p>Guarda palavras de uma aula para começares a treinar.</p>";
      card.querySelector("button")?.addEventListener("click", () => {
        renderVocabularyTrainer();
        $("#page-heading").focus();
      });
      if (focus) card.querySelector("h2")?.focus();
      return;
    }

    const { word, type, distractors = [] } = round[position];
    const options = [...new Set([word.explanation_pt, ...distractors])].sort((a, b) => a.localeCompare(b, "pt-PT"));
    const isChoice = type === "meaning";
    const prompt = isChoice ? `O que significa «${word.pt}»?` : "Escreve o termo em português.";
    const input = isChoice
      ? options.map((option, index) => `<label><input type="radio" name="answer" value="${index}" required>
          <span>${safe(option)}</span></label>`).join("")
      : `<label class="vocabulary-input">Resposta <input name="answer" type="text" required autocomplete="off"></label>`;

    card.innerHTML = `<p class="muted">Palavra ${position + 1} de ${round.length}</p>
      <form id="vocabulary-answer">
        <fieldset class="question">
          <legend tabindex="-1"><strong>${safe(prompt)}</strong></legend>
          ${type === "spelling" ? `<p>${safe(word.explanation_pt)}</p>${russian(word.ru, "span")}` : ""}
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
      const ok = isChoice ? options[Number(answer)] === word.explanation_pt
        : spellingAnswer(answer) === spellingAnswer(word.pt);
      if (ok) correct += 1;

      const review = load(VOCABULARY_REVIEW_KEY, {});
      const pending = { ...review[word.id] };
      if (ok) delete pending[type];
      else pending[type] = isChoice ? distractors : true;
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
      position += 1;
      renderCard(true);
    });
  }

  renderCard();
}
