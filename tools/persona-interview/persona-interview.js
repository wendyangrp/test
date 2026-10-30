// Persona Interview: set up a persona, then interview it.
// The conversation lives only in this page; the server just relays each
// request to the AI and keeps no history.
(function () {
  var MAX_QUESTIONS = 30; // keep in sync with MAX_MESSAGES in server/server.js
  var WIDE_SCREEN = "(min-width: 900px)"; // keep in sync with the .interview layout in css/style.css

  var EXAMPLES = [
    {
      label: "Night-shift nurse",
      name: "Maya Okafor",
      age: "34",
      occupation: "Night-shift nurse at a city hospital",
      background:
        "Lives with her partner and 6-year-old son. Commutes 40 minutes by bus. Has worked nights for five years so she can be home after school.",
      goals:
        "Get enough sleep, spend real time with her son, and cook healthier meals instead of grabbing snacks on shift.",
      frustrations:
        "Grocery stores and appointments are only open while she should be asleep. Meal-planning apps assume a 9-to-5 day. Feels guilty when she is too tired to play.",
      personality: "Warm but tired, practical, a little sarcastic. Gives concrete examples from her week.",
    },
    {
      label: "First-year student",
      name: "Leo Brandt",
      age: "18",
      occupation: "First-year engineering student, living away from home for the first time",
      background:
        "Moved 300 km from his family to a shared student flat. Has a part-time job at a café on weekends. Was a top student at school and is used to things coming easily.",
      goals: "Keep up with coursework, make real friends, and manage money without asking his parents.",
      frustrations:
        "Lectures move fast and he is embarrassed to ask for help. Cooking and laundry take more time than he expected. Group chats are full of plans he finds out about too late.",
      personality: "Polite and a bit guarded at first. Downplays problems, then opens up when asked follow-up questions.",
    },
    {
      label: "Retired volunteer",
      name: "Rosa Delgado",
      age: "71",
      occupation: "Retired school librarian, volunteers at a community food bank",
      background:
        "Widowed, lives alone in a small town and drives to the food bank three times a week. Her grandchildren live abroad and she keeps in touch by video call.",
      goals: "Stay useful and connected, keep her independence, and see her grandchildren more often.",
      frustrations:
        "The food bank's new online rota is confusing and the text is too small. Feels rushed by phone menus and apps. Worries about what happens when she can no longer drive.",
      personality: "Chatty and warm, tells stories with lots of detail, sometimes drifts off topic. Dry sense of humour.",
    },
  ];

  var STARTERS = [
    "Tell me about the last time ",
    "Walk me through ",
    "How did that feel?",
    "Why is that?",
    "What's the hardest part of ",
    "Can you give me an example?",
  ];

  // Questions that usually get a one-word answer.
  var CLOSED_QUESTION = /^\s*(do|does|did|don't|would|will|is|isn't|are|aren't|was|were|can|could|have|has|had|should|shall|may|might)\b/i;

  var FIELDS = ["name", "age", "occupation", "background", "goals", "frustrations", "personality"];
  var FACT_LABELS = {
    background: "Background",
    goals: "Goals",
    frustrations: "Frustrations",
    personality: "Personality",
  };

  var persona = null;
  var messages = []; // [{ role: "user" | "assistant", content: string }]
  var busy = false;

  var $ = function (id) {
    return document.getElementById(id);
  };

  document.addEventListener("DOMContentLoaded", function () {
    var personaForm = $("persona-form");
    var chatForm = $("chat-form");
    var question = $("question");

    EXAMPLES.forEach(function (example) {
      addChip($("example-chips"), example.label, function () {
        FIELDS.forEach(function (key) {
          personaForm.elements[key].value = example[key];
        });
      });
    });

    STARTERS.forEach(function (text) {
      // Starters that end in a space are unfinished sentences: show them with "…".
      addChip($("starter-chips"), text.trim() + (/ $/.test(text) ? "…" : ""), function () {
        question.value = text;
        question.focus();
        question.setSelectionRange(text.length, text.length);
        updateHint();
      });
    });

    personaForm.addEventListener("submit", function (event) {
      event.preventDefault();
      persona = {};
      FIELDS.forEach(function (key) {
        persona[key] = personaForm.elements[key].value.trim();
      });
      showChat();
    });

    chatForm.addEventListener("submit", function (event) {
      event.preventDefault();
      ask(question.value.trim());
    });

    // Enter sends, Shift+Enter adds a new line.
    question.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        chatForm.requestSubmit();
      }
    });

    question.addEventListener("input", updateHint);

    $("edit-persona").addEventListener("click", function () {
      if (messages.length && !confirm("Editing the persona starts a new interview. Continue?")) return;
      resetChat();
      $("chat-step").hidden = true;
      $("setup-step").hidden = false;
    });

    $("new-interview").addEventListener("click", function () {
      if (messages.length && !confirm("Clear this interview and start again with the same persona?")) return;
      resetChat();
      question.focus();
    });

    $("copy-transcript").addEventListener("click", copyTranscript);
  });

  function addChip(container, label, onClick) {
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = label;
    chip.addEventListener("click", onClick);
    container.appendChild(chip);
  }

  function initials(name) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) {
        return part.charAt(0).toUpperCase();
      })
      .join("");
  }

  function showChat() {
    $("persona-initials").textContent = initials(persona.name);
    $("persona-title").textContent = persona.name;
    $("persona-subtitle").textContent = [persona.age && persona.age + " years old", persona.occupation]
      .filter(Boolean)
      .join(" · ");

    var facts = $("persona-facts");
    facts.innerHTML = "";
    Object.keys(FACT_LABELS).forEach(function (key) {
      if (!persona[key]) return;
      var term = document.createElement("dt");
      term.textContent = FACT_LABELS[key];
      var detail = document.createElement("dd");
      detail.textContent = persona[key];
      facts.appendChild(term);
      facts.appendChild(detail);
    });
    if (!facts.children.length) {
      var none = document.createElement("dd");
      none.textContent = "No extra details given.";
      facts.appendChild(none);
    }

    // Sidebar starts open on wide screens, collapsed on phones.
    $("persona-card").open = window.matchMedia(WIDE_SCREEN).matches;

    resetChat();
    $("setup-step").hidden = true;
    $("chat-step").hidden = false;
    $("question").focus();
  }

  function resetChat() {
    messages = [];
    var log = $("chat-log");
    log.innerHTML = "";
    var empty = document.createElement("li");
    empty.className = "chat-empty";
    empty.textContent = "Ask your first question. Open questions like “Tell me about the last time…” get the richest answers.";
    log.appendChild(empty);
    $("question").value = "";
    updateHint();
    hideError();
    setStatus("");
  }

  function updateHint() {
    $("question-hint").hidden = !CLOSED_QUESTION.test($("question").value);
  }

  function addBubble(role, text) {
    var log = $("chat-log");
    var empty = log.querySelector(".chat-empty");
    if (empty) empty.remove();

    var item = document.createElement("li");
    item.className = "bubble " + (role === "user" ? "me" : "them");
    var who = document.createElement("span");
    who.className = "who";
    who.textContent = role === "user" ? "You" : persona.name;
    item.appendChild(who);
    item.appendChild(document.createTextNode(text));
    log.appendChild(item);
    log.scrollTop = log.scrollHeight;
    return item;
  }

  function addTypingBubble() {
    var item = addBubble("assistant", "");
    item.classList.add("typing");
    item.setAttribute("aria-label", persona.name + " is typing");
    var dots = document.createElement("span");
    dots.className = "dots";
    dots.innerHTML = "<span></span><span></span><span></span>";
    item.appendChild(dots);
    return item;
  }

  function ask(text) {
    if (!text || busy) return;
    if (messages.filter(function (m) { return m.role === "user"; }).length >= MAX_QUESTIONS) {
      showError("This interview has reached " + MAX_QUESTIONS + " questions. Copy the transcript, then start a new interview.");
      return;
    }

    hideError();
    messages.push({ role: "user", content: text });
    addBubble("user", text);
    $("question").value = "";
    updateHint();
    setBusy(true);
    var typing = addTypingBubble();

    // Relative, so it also works when the site lives in a sub-folder.
    fetch("../../api/persona-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: persona, messages: messages }),
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (!res.ok || !data.reply) {
              if (!data.error && (res.status === 404 || res.status === 405)) {
                // No server here, e.g. a copy on GitHub Pages, which only serves files.
                throw new Error("This copy of the site can't reach the AI, so the persona can't reply here. Open the full site (hosted on Render) to run interviews.");
              }
              throw new Error(data.error || "Something went wrong. Please try again.");
            }
            return data.reply;
          });
      })
      .then(function (reply) {
        typing.remove();
        messages.push({ role: "assistant", content: reply });
        addBubble("assistant", reply);
      })
      .catch(function (err) {
        typing.remove();
        // Take the unanswered question back out so the student can retry it.
        messages.pop();
        $("chat-log").lastElementChild.remove();
        if (!messages.length) resetChat();
        $("question").value = text;
        updateHint();
        showError(err.message === "Failed to fetch" ? "Could not reach the server. Check your connection and try again." : err.message);
      })
      .finally(function () {
        setBusy(false);
        $("question").focus();
      });
  }

  function copyTranscript() {
    if (!messages.length) {
      setStatus("Nothing to copy yet.");
      return;
    }
    var lines = ["Persona interview with " + persona.name, ""];
    messages.forEach(function (m) {
      lines.push((m.role === "user" ? "Interviewer: " : persona.name + ": ") + m.content);
      lines.push("");
    });
    var text = lines.join("\n");

    var done = function () {
      setStatus("Transcript copied.");
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () {
        fallbackCopy(text) ? done() : setStatus("Could not copy. Please select the text manually.");
      });
    } else {
      fallbackCopy(text) ? done() : setStatus("Could not copy. Please select the text manually.");
    }
  }

  function fallbackCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {}
    area.remove();
    return ok;
  }

  function setBusy(value) {
    busy = value;
    $("send-btn").disabled = value;
  }

  function setStatus(text) {
    $("status").textContent = text;
  }

  function showError(text) {
    var el = $("error");
    el.textContent = text;
    el.hidden = false;
  }

  function hideError() {
    $("error").hidden = true;
  }
})();
