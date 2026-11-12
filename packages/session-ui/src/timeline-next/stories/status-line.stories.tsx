import { StatusLane } from "../status-line"

export default {
  title: "Session/Timeline next/Status line",
  id: "timeline-status-line",
  render: () => (
    <div data-timeline="next" style={{ padding: "24px", display: "grid", gap: "8px", width: "520px" }}>
      <StatusLane label="Thinking" wave="thinking" />
      <StatusLane label="Working" wave="working" />
      <StatusLane label="Waiting for your answer" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        component:
          "The status line under a working turn: an audio wave beside the label while the model thinks or works, none while it waits.",
      },
    },
  },
}

export const States = {}
