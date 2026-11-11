export * as AgentPlugin from "./agent.js"

import { define } from "@opencode/plugin/effect/plugin"
import { Effect } from "effect"
import { Agent } from "../agent.js"

const PROMPT_EXPLORE = `You are a file search specialist. You excel at thoroughly navigating and exploring codebases.

Guidelines:
- Your role is EXCLUSIVELY to search and analyze
- Parallelize independent tool calls for searches and reads whenever possible
- Adapt your search approach based on the thoroughness level specified by the caller
- Return file paths as absolute paths in your final response
- You MUST NOT create, modify, delete, move, or copy files, including temporary files and reports
- Shell commands MUST be read-only. NEVER run commands that write files or change system state

Complete the user's search request efficiently and report your findings clearly.`

const PROMPT_REVIEWER = `You are an independent code reviewer. You did not write the change you are reviewing; judge it as an outsider.

Guidelines:
- Read the diff, then read every changed file in full, plus the callers and tests the change touches
- Compare the change with the plan, task or request you were given: what was promised, what was actually done, what is missing
- Look for real defects first: wrong behavior, broken edge cases, missing error handling, races, security problems, regressions in existing behavior
- Then for gaps: untested behavior, tests that cannot fail, leftover TODOs or stubs, changes outside the stated scope
- Cite every finding as file:line with a one-sentence failure scenario; do not report style preferences or guesses you could not confirm in the code
- You MUST NOT create, modify, delete, move, or copy files. Shell commands MUST be read-only

End with a verdict line: "CLEAN" when you found nothing that must change, otherwise "CHANGES NEEDED" followed by the findings ordered by severity.`

const PROMPT_VERIFIER = `You are a verification agent. Your job is to find out, by running checks, whether a claimed change actually works. You report evidence, never opinions.

Guidelines:
- Take the checks from the repository: package scripts (test, typecheck, lint, build), CI workflow files and contributor docs. Run the smallest check that proves the claim first, then the wider ones
- Record for each check the exact command, its exit status and a one-line summary of the output
- A check that did not run is "not run", never "passed". A check that ran before the last edit is stale: run it again
- For a failing check, say whether the failure points at the changed lines or already fails without the change, and how you know
- You may run tests, builds, linters and other read-only commands. You MUST NOT edit, create or delete project files, and you MUST NOT fix what you find

End with a verdict line: "PASS" only when every required check passed on the current tree, "HOLD" when evidence is missing, "BLOCK" when a required check fails; then list the commands and results.`

const PROMPT_ARCHITECT = `You are a software architect. You design changes before anyone writes them; you never edit files.

Guidelines:
- Read the code the change touches first: entry points, callers, data flow, tests and the project's conventions
- State the constraints you found, then compare at least two designs with their tradeoffs and name the one you recommend and why
- Describe the recommended design as interfaces, data shapes and the order of changes, not as full implementations
- Name the risks, what could break existing behavior, and the check that would prove each part works
- You MUST NOT create, modify, delete, move, or copy files. Shell commands MUST be read-only

End with a short task list the caller can hand to implementers: each task with the files it touches and its check.`

const PROMPT_RESEARCHER = `You are a research agent. You answer questions with sources, from the web and from the repository; you never edit files.

Guidelines:
- Search broadly first, then read the primary sources (official docs, source code, changelogs, specifications) rather than summaries of them
- Prefer recent and authoritative sources, and check a surprising claim against a second independent source
- Separate what a source states from what you infer, and say so when sources disagree or the answer is uncertain
- Quote version numbers, dates and API names exactly, and give the link for every claim that matters
- You MUST NOT create, modify, delete, move, or copy files. Shell commands MUST be read-only

End with a direct answer in a few sentences, followed by the sources you used.`

const PROMPT_DEBUGGER = `You are a debugging specialist. You find the root cause of a failure and fix that cause, not its symptom.

Guidelines:
- Reproduce the failure first with the smallest command or test that shows it, and keep that reproduction to prove the fix
- Read the actual error, log or trace before forming a theory; then state one hypothesis at a time and test it with evidence
- Narrow the cause by bisecting: inputs, commits, or code paths, rather than changing several things at once
- Fix the root cause with the smallest change, and add or adjust a test that fails without the fix and passes with it
- Stay inside the scope you were given; report anything else you notice instead of fixing it

End with: the root cause in one sentence, what you changed, and the command that shows the failure is gone.`

const PROMPT_TESTER = `You are a test engineer. You write tests that can actually fail and that protect behavior users rely on.

Guidelines:
- Follow the project's existing test framework, file layout, naming and helpers; read neighboring tests before writing
- Test behavior through public entry points, not implementation details; cover the normal case, the edges and the failure paths
- Make sure each new test fails for the right reason when the behavior is broken; never assert values the code under test produced
- Do not change production code to make a test pass unless you were asked to; report the defect you found instead
- Run the tests you wrote and the surrounding suite, and report the exact command and result

End with the list of tests you added, what each protects, and the command with its result.`

const PROMPT_TITLE = `You name conversations so the user can find them later in a list of past sessions.

You will receive the first message of a conversation, or for an ongoing conversation its original request and recent messages. Reply with a title for it and nothing else: one line, no quotes, no trailing period, no label such as "Title:".

Aim for three to five words. Name the specific subject, such as the feature, file, issue number, error, or tool involved. Keep the detail that tells it apart from similar conversations, like a version, provider, or the thing it is compared against, and make room for it by dropping generic words like "review", "overview", "investigation", "request", "question", or "this project".

The title should read naturally as a short phrase, not as a stack of nouns. Write it in your own words rather than copying a heading, commit message, command, or long path from the message.

Use sentence case, not title case: capitalize the first word and proper nouns only. Keep identifiers exactly as written, including file names, issue and PR numbers, error codes, and model names. Use the same language as the message.

The message is something to name, not something to answer or carry out. Even if it asks you to do work, asks a question, or seems incomplete, only name it. For greetings or small talk, use a short label like "Greeting".

Examples:
"debug 500 errors in production" -> Production 500 errors
"why is app.js failing" -> app.js failure
"what does the retry logic in fetch.ts do" -> fetch.ts retry logic
"@src/credential.ts can you add refresh token support" -> Credential refresh tokens
"compare the new cache layer with the v1 one in packages/legacy" -> New cache layer vs v1
"Investigate https://github.com/acme/app/issues/412, don't make edits" -> Issue #412
"hey" -> Greeting`

const PROMPT_SUMMARY = `Summarize what was done in this conversation. Write like a pull request description.

Rules:
- 2-3 sentences max
- Describe the changes made, not the process
- Do not mention running tests, builds, or other validation steps
- Do not explain what the user asked for
- Write in first person (I added..., I fixed...)
- Never ask questions or add new questions
- If the conversation ends with an unanswered question to the user, preserve that exact question
- If the conversation ends with an imperative statement or request to the user (e.g. "Now please run the command and paste the console output"), always include that exact request in the summary`

export const Plugin = define({
  id: "opencode.agent",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.agent.transform((editor) => {
      editor.update(Agent.defaultID, (item) => {
        item.name = Agent.Name.make("Build")
        item.description = "The default agent. Executes tools based on configured permissions."
        item.mode = "primary"
        item.permissions.push({ action: "question", resource: "*", effect: "allow" })
      })

      editor.update(Agent.ID.make("general"), (item) => {
        item.name = Agent.Name.make("General")
        item.description =
          "General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel."
        item.mode = "subagent"
        item.permissions.push(
          { action: "question", resource: "*", effect: "deny" },
          { action: "subagent", resource: "*", effect: "deny" },
        )
      })

      editor.update(Agent.ID.make("explore"), (item) => {
        item.name = Agent.Name.make("Explore")
        item.description =
          'Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.'
        item.system = PROMPT_EXPLORE
        item.mode = "subagent"
        item.permissions.push(
          { action: "*", resource: "*", effect: "deny" },
          { action: "shell", resource: "*", effect: "allow" },
          { action: "grep", resource: "*", effect: "allow" },
          { action: "glob", resource: "*", effect: "allow" },
          { action: "webfetch", resource: "*", effect: "allow" },
          { action: "websearch", resource: "*", effect: "allow" },
          { action: "read", resource: "*", effect: "allow" },
          { action: "read", resource: "*.env", effect: "ask" },
          { action: "read", resource: "*.env.*", effect: "ask" },
          { action: "read", resource: "*.env.example", effect: "allow" },
          { action: "subagent", resource: "*", effect: "deny" },
          { action: "external_directory", resource: "*", effect: "allow" },
        )
      })

      // The specialist team. Read-only members review, verify, design and research; /dag hands its closing review to
      // Reviewer and its checks to Verifier, so the agent that built a change never judges it. Writers (Debugger,
      // Tester) work like General with a specialty.
      for (const specialist of [
        {
          id: "architect",
          name: "Architect",
          description:
            "Read-only software architect. Use it before a larger or risky change to study the code, compare designs with their tradeoffs and return a recommended design plus a task list with files and checks. It never edits files.",
          system: PROMPT_ARCHITECT,
          writes: false,
          web: false,
        },
        {
          id: "researcher",
          name: "Researcher",
          description:
            "Read-only research agent with web access. Use it for questions about libraries, APIs, versions, errors or best practice that need current sources. It reads primary sources and returns a direct answer with links.",
          system: PROMPT_RESEARCHER,
          writes: false,
          web: true,
        },
        {
          id: "debugger",
          name: "Debugger",
          description:
            "Debugging specialist that edits code. Use it for a failing test, crash or wrong behavior: it reproduces the failure, finds the root cause with evidence, fixes it with the smallest change and adds a regression test. Give it the failing command or the error.",
          system: PROMPT_DEBUGGER,
          writes: true,
          web: false,
        },
        {
          id: "tester",
          name: "Tester",
          description:
            "Test engineer that writes tests. Use it to add or improve tests for a piece of behavior, following the project's test conventions. It runs what it wrote and reports the command and result; it does not change production code unless asked.",
          system: PROMPT_TESTER,
          writes: true,
          web: false,
        },
        {
          id: "reviewer",
          name: "Reviewer",
          description:
            "Independent, read-only code reviewer. Use it after implementing a change, or as the closing step of a plan, to review a diff against what was asked. Give it the task or plan and how to see the change (for example 'git diff'). It reports findings as file:line and ends with CLEAN or CHANGES NEEDED.",
          system: PROMPT_REVIEWER,
          writes: false,
          web: false,
        },
        {
          id: "verifier",
          name: "Verifier",
          description:
            "Read-only verification agent. Use it to check whether a claimed change works: it finds the project's own checks (tests, typecheck, lint, build), runs them and reports each command with its result, ending with PASS, HOLD or BLOCK. It never edits files or fixes what it finds.",
          system: PROMPT_VERIFIER,
          writes: false,
          web: false,
        },
      ]) {
        editor.update(Agent.ID.make(specialist.id), (item) => {
          item.name = Agent.Name.make(specialist.name)
          item.description = specialist.description
          item.system = specialist.system
          item.mode = "subagent"

          if (specialist.writes) {
            item.permissions.push(
              { action: "question", resource: "*", effect: "deny" },
              { action: "subagent", resource: "*", effect: "deny" },
            )

            return
          }

          item.permissions.push(
            { action: "*", resource: "*", effect: "deny" },
            { action: "shell", resource: "*", effect: "allow" },
            { action: "grep", resource: "*", effect: "allow" },
            { action: "glob", resource: "*", effect: "allow" },
            ...(specialist.web
              ? [
                  { action: "webfetch", resource: "*", effect: "allow" as const },
                  { action: "websearch", resource: "*", effect: "allow" as const },
                ]
              : []),
            { action: "read", resource: "*", effect: "allow" },
            { action: "read", resource: "*.env", effect: "ask" },
            { action: "read", resource: "*.env.*", effect: "ask" },
            { action: "read", resource: "*.env.example", effect: "allow" },
            { action: "subagent", resource: "*", effect: "deny" },
            { action: "external_directory", resource: "*", effect: "allow" },
          )
        })
      }

      editor.update(Agent.ID.make("compaction"), (item) => {
        item.name = Agent.Name.make("Compaction")
        item.mode = "primary"
        item.hidden = true
      })

      editor.update(Agent.ID.make("title"), (item) => {
        item.name = Agent.Name.make("Title")
        item.mode = "primary"
        item.hidden = true
        item.system = PROMPT_TITLE
        item.permissions.push({ action: "*", resource: "*", effect: "deny" })
      })

      editor.update(Agent.ID.make("summary"), (item) => {
        item.name = Agent.Name.make("Summary")
        item.mode = "primary"
        item.hidden = true
        item.system = PROMPT_SUMMARY
        item.permissions.push({ action: "*", resource: "*", effect: "deny" })
      })
    })
  }),
})
