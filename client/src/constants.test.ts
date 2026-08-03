import { describe, it, expect } from "vitest";
import {
  STORAGE_KEYS,
  pieceToFigurineWhite,
  pieceToFigurineBlack,
  pieceToFigurine,
} from "./constants.js";

describe("constants", () => {
  describe("STORAGE_KEYS", () => {
    it("has correct key values", () => {
      expect(STORAGE_KEYS.pid).toBe("tc:pid");
      expect(STORAGE_KEYS.name).toBe("tc:name");
      expect(STORAGE_KEYS.side).toBe("tc:side");
    });
  });

  describe("pieceToFigurineWhite", () => {
    it("maps all white pieces to correct Unicode symbols", () => {
      expect(pieceToFigurineWhite["K"]).toBe("\u2654"); // White King
      expect(pieceToFigurineWhite["Q"]).toBe("\u2655"); // White Queen
      expect(pieceToFigurineWhite["R"]).toBe("\u2656"); // White Rook
      expect(pieceToFigurineWhite["B"]).toBe("\u2657"); // White Bishop
      expect(pieceToFigurineWhite["N"]).toBe("\u2658"); // White Knight
      expect(pieceToFigurineWhite["P"]).toBe("\u2659"); // White Pawn
    });

    it("has entries for all 6 piece types", () => {
      expect(Object.keys(pieceToFigurineWhite)).toHaveLength(6);
    });
  });

  describe("pieceToFigurineBlack", () => {
    it("maps all black pieces to correct Unicode symbols", () => {
      expect(pieceToFigurineBlack["K"]).toBe("\u265A"); // Black King
      expect(pieceToFigurineBlack["Q"]).toBe("\u265B"); // Black Queen
      expect(pieceToFigurineBlack["R"]).toBe("\u265C"); // Black Rook
      expect(pieceToFigurineBlack["B"]).toBe("\u265D"); // Black Bishop
      expect(pieceToFigurineBlack["N"]).toBe("\u265E"); // Black Knight
      expect(pieceToFigurineBlack["P"]).toBe("\u265F"); // Black Pawn
    });

    it("has entries for all 6 piece types", () => {
      expect(Object.keys(pieceToFigurineBlack)).toHaveLength(6);
    });
  });

  describe("pieceToFigurine (neutral)", () => {
    it("uses filled glyphs for all pieces", () => {
      expect(pieceToFigurine["K"]).toBe("\u265A");
      expect(pieceToFigurine["Q"]).toBe("\u265B");
      expect(pieceToFigurine["R"]).toBe("\u265C");
      expect(pieceToFigurine["B"]).toBe("\u265D");
      expect(pieceToFigurine["N"]).toBe("\u265E");
      expect(pieceToFigurine["P"]).toBe("\u265F");
    });

    it("has entries for all 6 piece types", () => {
      expect(Object.keys(pieceToFigurine)).toHaveLength(6);
    });
  });
});
