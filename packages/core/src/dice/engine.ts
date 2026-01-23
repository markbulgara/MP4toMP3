export type DiceTerm = {
  count: number;
  sides: number;
  rolls: number[];
  total: number;
};

export type RollResult = {
  expression: string;
  dice: DiceTerm[];
  modifiers: number[];
  total: number;
  prettyBreakdown: string;
};

export type RollMode = "normal" | "advantage" | "disadvantage";

const rollDie = (sides: number) => Math.floor(Math.random() * sides) + 1;

const parseExpression = (expression: string) => {
  const cleaned = expression.replace(/\s+/g, "");
  const pattern = /([+-]?\d*d\d+|[+-]?\d+)/gi;
  const matches = cleaned.match(pattern);
  if (!matches) {
    throw new Error("Invalid dice expression");
  }
  return matches;
};

const evalTerm = (term: string): { dice?: DiceTerm; modifier?: number } => {
  if (term.includes("d")) {
    const [countRaw, sidesRaw] = term.split("d");
    const count = countRaw === "" || countRaw === "+" ? 1 : Number(countRaw);
    const sides = Number(sidesRaw);
    if (Number.isNaN(count) || Number.isNaN(sides)) {
      throw new Error("Invalid dice term");
    }
    const rolls = Array.from({ length: Math.abs(count) }, () => rollDie(sides));
    const total = rolls.reduce((sum, value) => sum + value, 0) * Math.sign(count || 1);
    return { dice: { count, sides, rolls, total } };
  }
  return { modifier: Number(term) };
};

export const rollDice = (expression: string, mode: RollMode = "normal"): RollResult => {
  const terms = parseExpression(expression);
  const dice: DiceTerm[] = [];
  const modifiers: number[] = [];
  terms.forEach((term) => {
    const evaluated = evalTerm(term);
    if (evaluated.dice) {
      dice.push(evaluated.dice);
    }
    if (typeof evaluated.modifier === "number") {
      modifiers.push(evaluated.modifier);
    }
  });

  const totalDice = dice.reduce((sum, term) => sum + term.total, 0);
  const totalModifiers = modifiers.reduce((sum, mod) => sum + mod, 0);
  const total = totalDice + totalModifiers;

  const breakdown = [
    ...dice.map((term) => `${term.count}d${term.sides}(${term.rolls.join(",")})`),
    ...modifiers.map((mod) => `${mod >= 0 ? "+" : ""}${mod}`)
  ].join(" ");

  return {
    expression,
    dice,
    modifiers,
    total,
    prettyBreakdown: breakdown
  };
};

export const rollD20 = (modifier = 0, mode: RollMode = "normal") => {
  const first = rollDice("1d20");
  if (mode === "normal") {
    return { ...first, total: first.total + modifier };
  }
  const second = rollDice("1d20");
  const chosen = mode === "advantage" ? Math.max(first.total, second.total) : Math.min(first.total, second.total);
  return {
    expression: `d20 (${mode})`,
    dice: [...first.dice, ...second.dice],
    modifiers: [modifier],
    total: chosen + modifier,
    prettyBreakdown: `${first.total} / ${second.total} ${mode} + ${modifier}`
  };
};

export const parseDiceExpression = parseExpression;
