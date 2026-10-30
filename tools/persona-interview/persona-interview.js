// Persona Interview: set up a persona, then interview it.
// The conversation lives only in this page; the server just relays each
// request to the AI and keeps no history.
(function () {
  var MAX_QUESTIONS = 30; // keep in sync with MAX_MESSAGES in server/server.js

  var EXAMPLE = {
    name: "Maya Okafor",
    age: "34",
    occupation: "Night-shift nurse at a city hospital",
    background:
      "Lives with her partner and 6-year-old son. Commutes 40 minutes by bus. Has worked nights for five years so she can be home after school.",
    goals:
      "Get enough sleep, spend real time with her son, and cook healthier meals instead of grabbing snacks on shift.",
    frustrations:
      "Grocery stores and appointments are only open while she should be asleep. Meal-planning apps assume a 9-to-5 day. Feels guilty when she is too tired to play.",
    personality:
      "Warm but tired, practical, a little sarcastic. Gives concrete examples from her week.",
  };

  var FIELDS = ["name", "age", "occupation", "background", "goals", "frustrations", "personality"];

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

    $("fill-example").addEventListener("click", function () {
      FIELDS.forEach(function (key) {
        personaForm.elements[key].value = EXAMPLE[key];
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

  function showChat() {
    $("persona-title").textContent = persona.name;
    $("persona-subtitle").textContent = [persona.age && persona.age + " years old", persona.occupation]
      .filter(Boolean)
      .join(" · ");
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
    empty.textContent = "Ask your first question. Try open questions like “Tell me about the last time…”.";
    log.appendChild(empty);
    hideError();
    setStatus("");
  }

  function addBubble(role, text, extraClass) {
    var log = $("chat-log");
    var empty = log.querySelector(".chat-empty");
    if (empty) empty.remove();

    var item = document.createElement("li");
    item.className = "bubble " + (role === "user" ? "me" : "them") + (extraClass ? " " + extraClass : "");
    var who = document.createElement("span");
    who.className = "who";
    who.textContent = role === "user" ? "You" : persona.name;
    item.appendChild(who);
    item.appendChild(document.createTextNode(text));
    log.appendChild(item);
    log.scrollTop = log.scrollHeight;
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
    setBusy(true);
    var typing = addBubble("assistant", "is thinking…", "typing");

    fetch("/api/persona-reply", {
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
