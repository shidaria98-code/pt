const HGP_LESSONS = [
  {
    "id": "HGP5.02.05",
    "slug": "hgp5-02-05",
    "title": "Os Iberos, os Celtas e os Celtiberos"
  },
  {
    "id": "HGP5.02.06",
    "slug": "hgp5-02-06",
    "title": "Os Fenícios, os Gregos e os Cartagineses"
  },
  {
    "id": "HGP5.02.08",
    "slug": "hgp5-02-08",
    "title": "A conquista romana da Península Ibérica"
  },
  {
    "id": "HGP5.02.09",
    "slug": "hgp5-02-09",
    "title": "A resistência dos Lusitanos e Viriato"
  },
  {
    "id": "HGP5.02.12",
    "slug": "hgp5-02-12",
    "title": "Os povos germânicos na Península Ibérica"
  },
  {
    "id": "HGP5.02.13",
    "slug": "hgp5-02-13",
    "title": "O Islão e a conquista muçulmana"
  }
].map(entry => ({ ...entry, year: "5", subject: "hgp" }));

const HGP_TOPIC = "A Península Ibérica — Passagem e fixação de povos";

function renderHgpTopic() {
  const progress = load("pt-hgp-progress", {});
  return `<a href="${catalogLink("5")}">← Disciplinas · 5.º ano</a>
    ${heading(HGP_TOPIC)}
    <p class="muted">Aulas disponíveis neste piloto.</p>
    <ul class="word-grid">${HGP_LESSONS.map(entry => {
      const completed = Object.keys(progress[entry.id] ?? {}).length;
      return `<li class="word"><a href="${lessonLink(entry)}">${safe(entry.title)}</a>
        ${completed ? `<p class="muted">Atividades verificadas: ${completed}</p>` : ""}</li>`;
    }).join("")}</ul>`;
}

function formatTheory(block) {
  if (block.startsWith("- ")) {
    return `<ul>${block.split("\n").map(line => `<li>${safe(line.slice(2))}</li>`).join("")}</ul>`;
  }
  return `<p>${safe(block)}</p>`;
}

function normaliseHgpAnswer(value) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").trim()
    .replace(/\s+/g, " ").toLocaleLowerCase("pt-PT");
}

function evaluateHgpPart(part, input) {
  const answer = normaliseHgpAnswer(input);
  const correct = part.answers.some(value => normaliseHgpAnswer(value) === answer);
  const total = part.points ?? 1;
  const detail = Object.hasOwn(part.feedback ?? {}, answer) ? part.feedback[answer] : part.explanation;
  return { answer, correct, earned: correct ? total : 0, total, detail };
}

function renderHgpActivity(activity, draft) {
  return `<form class="hgp-activity" data-activity="${safe(activity.id)}">
    ${(activity.context ?? []).map(text => `<p>${safe(text)}</p>`).join("")}
    <fieldset class="question">
      <legend><strong>${safe(activity.prompt)}</strong>${russian(activity.prompt_ru, "span")}</legend>
      ${activity.parts.map(part => {
        const answer = draft[part.id] ?? "";
        const control = part.options
          ? `<select name="${safe(part.id)}">
              <option value="">Escolhe uma resposta</option>
              ${part.options.map(option => `<option value="${safe(option)}"${option === answer ? " selected" : ""}>${safe(option)}</option>`).join("")}
            </select>`
          : `<input type="text" name="${safe(part.id)}" value="${safe(answer)}" autocomplete="off">`;
        return `<div class="hgp-part">
          <label><span>${safe(part.prompt)}</span>${control}</label>
          <p class="feedback" data-feedback hidden></p>
        </div>`;
      }).join("")}
      <button class="primary" type="submit">Verificar</button>
      <p data-result role="status"></p>
    </fieldset>
  </form>`;
}

function updateHgpStorage(key, lessonId, activityId, value) {
  const all = load(key, {});
  const lesson = all[lessonId] ?? {};
  lesson[activityId] = value;
  all[lessonId] = lesson;
  save(key, all);
}

function connectHgpActivity(form, lessonId, activity, previous) {
  const result = form.querySelector("[data-result]");
  const messages = [...form.querySelectorAll("[data-feedback]")];

  function currentAnswers() {
    const values = new FormData(form);
    return Object.fromEntries(activity.parts.map(part => [part.id, values.get(part.id) ?? ""]));
  }

  function showResult(answers) {
    let earned = 0;
    let total = 0;
    activity.parts.forEach((part, index) => {
      const evaluation = evaluateHgpPart(part, answers[part.id] ?? "");
      earned += evaluation.earned;
      total += evaluation.total;
      const message = messages[index];
      const status = evaluation.correct ? "Correto." : evaluation.answer ? "Resposta incorreta." : "Sem resposta.";
      const expected = evaluation.correct ? "" : ` Resposta: ${part.answers[0]}.`;
      message.textContent = `${status}${expected} ${evaluation.detail}`;
      message.hidden = false;
    });
    result.textContent = `Resultado: ${earned}/${total} ${total === 1 ? "ponto" : "pontos"}.`;
    return { earned, total };
  }

  if (previous) {
    const sameAnswers = JSON.stringify(currentAnswers()) === JSON.stringify(previous.answers);
    if (sameAnswers) {
      showResult(previous.answers);
    } else {
      result.textContent = `Último resultado: ${previous.earned}/${previous.total}.`;
    }
  }

  form.addEventListener("input", () => {
    updateHgpStorage("pt-hgp-drafts", lessonId, activity.id, currentAnswers());
    messages.forEach(message => { message.hidden = true; });
    result.textContent = previous ? `Último resultado: ${previous.earned}/${previous.total}.` : "";
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    const answers = currentAnswers();
    previous = { answers, ...showResult(answers) };
    updateHgpStorage("pt-hgp-drafts", lessonId, activity.id, answers);
    updateHgpStorage("pt-hgp-progress", lessonId, activity.id, previous);
  });
}

function renderHgpLesson(lesson, dictionary, area) {
  const terms = lesson.terms.map(id => ({ id, ...dictionary[id] }));
  const draft = load("pt-hgp-drafts", {})[lesson.id] ?? {};
  const progress = load("pt-hgp-progress", {})[lesson.id] ?? {};
  const practice = lesson.activities.filter(activity => activity.id.split(".").at(-1).startsWith("E"));
  const checks = lesson.activities.filter(activity => activity.id.split(".").at(-1).startsWith("V"));
  const section = (title, activities) => activities.length
    ? `<section><h2>${title}</h2>${activities.map(activity =>
        renderHgpActivity(activity, draft[activity.id] ?? progress[activity.id]?.answers ?? {})
      ).join("")}</section>`
    : "";

  area.innerHTML = `<section aria-label="Teoria">${lesson.theory.map(item =>
    `<h2>${safe(item.title)}</h2>${item.blocks.map(formatTheory).join("")}`).join("")}</section>
    <section>
      <h2>O meu vocabulário</h2>
      <dl>${terms.map(term => `<div class="term"><dt><strong>${safe(term.pt)}</strong> ${russian(term.ru, "span")}</dt>
        <dd><p>${safe(term.explanation_pt)}</p>${russian(term.explanation_ru)}</dd></div>`).join("")}</dl>
      <button class="primary" type="button" id="add-words">Guardar palavras no dicionário</button>
      <p id="word-status" role="status"></p>
    </section>
    ${section("Praticar", practice)}
    ${section("Verificar", checks)}`;
  area.querySelector("#add-words").addEventListener("click", () => saveWords(terms));
  const forms = area.querySelectorAll("[data-activity]");
  [...practice, ...checks].forEach((activity, index) =>
    connectHgpActivity(forms[index], lesson.id, activity, progress[activity.id]));
}
