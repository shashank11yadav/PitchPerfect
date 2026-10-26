import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination, pageItems } from "./Pagination";

describe("pageItems", () => {
  it("keeps the ends and the neighbors of the current page", () => {
    expect(pageItems(1, 3)).toEqual([1, 2, 3]);
    expect(pageItems(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
    expect(pageItems(10, 10)).toEqual([1, "gap", 9, 10]);
  });
});

describe("Pagination", () => {
  it("renders nothing for a single page", () => {
    const { container } = render(<Pagination page={1} pageSize={20} total={20} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders links with the current page marked", () => {
    render(
      <Pagination page={2} pageSize={20} total={60} hrefFor={(p) => `/jobs?page=${String(p)}`} />,
    );
    const nav = screen.getByRole("navigation", { name: "Pagination" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Previous page" })).toHaveAttribute(
      "href",
      "/jobs?page=1",
    );
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute("href", "/jobs?page=3");
  });

  it("calls onPageChange from buttons and disables moves past the ends", async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={3} pageSize={10} total={30} onPageChange={onPageChange} />);
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Page 1" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});
