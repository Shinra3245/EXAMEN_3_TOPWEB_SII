import { describe, expect, it } from "vitest";
import { getVisibleResourceState } from "@/hooks/resource-snapshot";

describe("getVisibleResourceState", () => {
  it("hides data from the previous path while the next resource loads", () => {
    const previousPathKey = Symbol("grades");
    const currentPathKey = Symbol("kardex");
    const previousState = {
      key: previousPathKey,
      path: "/api/grades",
      data: [{ subject: "Materia anterior" }],
      loading: false,
      error: null,
    };

    expect(
      getVisibleResourceState(previousState, currentPathKey, "/api/kardex"),
    ).toEqual({
      key: currentPathKey,
      path: "/api/kardex",
      data: null,
      loading: true,
      error: null,
    });
  });

  it("hides errors from the previous path while the next resource loads", () => {
    const previousPathKey = Symbol("grades");
    const currentPathKey = Symbol("kardex");
    const previousState = {
      key: previousPathKey,
      path: "/api/grades",
      data: null,
      loading: false,
      error: "Falló la consulta anterior",
    };

    expect(
      getVisibleResourceState(previousState, currentPathKey, "/api/kardex"),
    ).toEqual({
      key: currentPathKey,
      path: "/api/kardex",
      data: null,
      loading: true,
      error: null,
    });
  });

  it("keeps the current path's completed state visible", () => {
    const currentPathKey = Symbol("grades");
    const currentState = {
      key: currentPathKey,
      path: "/api/grades",
      data: [{ subject: "Materia actual" }],
      loading: false,
      error: null,
    };

    expect(
      getVisibleResourceState(currentState, currentPathKey, "/api/grades"),
    ).toBe(currentState);
  });

  it("does not restore an earlier result after returning to its path", () => {
    const originalGradesKey = Symbol("grades first visit");
    const kardexKey = Symbol("kardex visit");
    const returningGradesKey = Symbol("grades second visit");
    const previousGradesState = {
      key: originalGradesKey,
      path: "/api/grades",
      data: [{ subject: "Resultado previo" }],
      loading: false,
      error: null,
    };

    const kardexState = getVisibleResourceState(
      previousGradesState,
      kardexKey,
      "/api/kardex",
    );
    expect(kardexState.data).toBeNull();

    expect(
      getVisibleResourceState(
        previousGradesState,
        returningGradesKey,
        "/api/grades",
      ),
    ).toEqual({
      key: returningGradesKey,
      path: "/api/grades",
      data: null,
      loading: true,
      error: null,
    });
  });
});
