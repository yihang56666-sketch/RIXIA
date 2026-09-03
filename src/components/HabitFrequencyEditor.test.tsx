import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { HabitFrequencyEditor } from "./HabitFrequencyEditor"
import { useAppStore } from "../store/useAppStore"

describe("HabitFrequencyEditor", () => {
  beforeEach(() => {
    useAppStore.setState({
      habits: [
        {
          id: "habit-1",
          title: "早起",
          createdAt: "2026-08-01T00:00:00.000Z",
          checkedDates: [],
          frequency: { type: "daily" },
        },
      ],
    })
  })

  it("saves the selected frequency to the store", () => {
    render(<HabitFrequencyEditor habit={useAppStore.getState().habits[0]!} onClose={() => undefined} />)

    fireEvent.click(screen.getByRole("tab", { name: "每周 N 次" }))
    fireEvent.change(screen.getByLabelText("每周目标次数"), { target: { value: "4" } })
    fireEvent.click(screen.getByRole("button", { name: "保存" }))

    expect(useAppStore.getState().habits[0]?.frequency).toEqual({ type: "weekly-count", target: 4 })
  })

  it("saves the selected color to the store", () => {
    render(<HabitFrequencyEditor habit={useAppStore.getState().habits[0]!} onClose={() => undefined} />)

    fireEvent.click(screen.getByRole("button", { name: "选择颜色 #3f8f5f" }))
    fireEvent.click(screen.getByRole("button", { name: "保存" }))

    expect(useAppStore.getState().habits[0]?.color).toBe("#3f8f5f")
  })

  it("closes without saving when cancel is pressed", () => {
    const onClose = vi.fn()
    render(<HabitFrequencyEditor habit={useAppStore.getState().habits[0]!} onClose={onClose} />)

    fireEvent.click(screen.getByRole("tab", { name: "每周 N 次" }))
    fireEvent.click(screen.getByRole("button", { name: "取消" }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().habits[0]?.frequency).toEqual({ type: "daily" })
  })
})
