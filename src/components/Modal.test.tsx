import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { Modal } from "./Modal"
import { resetOverlayStackForTesting } from "../lib/overlayStack"

describe("Modal", () => {
  beforeEach(() => {
    resetOverlayStackForTesting()
  })

  it("renders the dialog content and accessible name", () => {
    render(
      <Modal title="编辑任务" onClose={() => undefined}>
        <p>表单内容</p>
      </Modal>,
    )

    expect(screen.getByRole("dialog", { name: "编辑任务" })).toBeInTheDocument()
    expect(screen.getByText("表单内容")).toBeInTheDocument()
  })

  it("closes when the overlay or close button is clicked", () => {
    const onClose = vi.fn()
    render(
      <Modal title="编辑任务" onClose={onClose}>
        <p>表单内容</p>
      </Modal>,
    )

    fireEvent.click(screen.getByRole("button", { name: "关闭" }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("dialog", { name: "编辑任务" }).parentElement as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it("keeps click events inside the dialog from closing it", () => {
    const onClose = vi.fn()
    render(
      <Modal title="编辑任务" onClose={onClose}>
        <p>表单内容</p>
      </Modal>,
    )

    fireEvent.click(screen.getByText("表单内容"))

    expect(onClose).not.toHaveBeenCalled()
  })

  it("routes Escape to the onClose handler and locks background scroll", async () => {
    const onClose = vi.fn()
    render(
      <Modal title="编辑任务" onClose={onClose}>
        <p>表单内容</p>
      </Modal>,
    )

    expect(document.body.dataset.overlayScrollLock).toBe("true")

    fireEvent.keyDown(window, { key: "Escape" })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})

