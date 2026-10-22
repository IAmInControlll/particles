// index.js - engine public API. Pages import { PF } from here.
import * as core from "./core.js";
import { createField } from "./field.js";
import { createDirector } from "./director.js";

export const PF = {
  ...core,
  get reduce() { return core.reduce; },
  createField,
  createDirector,
};

// console debugging convenience
window.PF = PF;
