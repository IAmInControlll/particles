// story.js - the Blackbird campaign as data. index.js drives it, comms.js
// speaks it, cutscene.js films it. No logic lives here.
//
// line:  [who, text]                      who = a CAST key
// beat:  { at, say: line[] }              fires once when wreck range < at * leg length
// leg:   { title, souls, open: line[], beats: beat[],
//          ambush?: { dist, roster, say }, dock: cutscene }
// cutscene: { shots: shot[], cues: cue[] }
// shot:  { dur, az: [a0, a1], el: [e0, e1], d: [d0, d1], look: [from, to], spd }
//        eye orbits the ship in its own basis (az 0 = astern, 90 = abeam on
//        the side away from the carrier, 180 = dead ahead; el up from the
//        wing plane; d in wu), easing a0->a1.
//        look anchors: "ship" | "wreck" | "mid" | "ahead". spd = autopilot wu/s.
// cue:   { t, say?: line[], now?: bool, act?: "pods" | "boom" | "card" }

export const CAST = {
  MAGS: { name: "MAGS", role: "BLACKBIRD CONTROL", col: "#7ec8ec", face: "headset" },
  HALE: { name: "CAPT. HALE", role: "BLACKBIRD BRIDGE", col: "#e8b060", face: "cap" },
  JUNO: { name: "JUNO", role: "ENGINEERING", col: "#8ee8a4", face: "goggles" },
  ORREN: { name: "ORREN", role: "GNAW // OPEN CHANNEL", col: "#ec5a48", face: "mask" },
  RUNNER: { name: "RUNNER", role: "YOU", col: "#d6e2ea", face: "helmet" },
};

export const SOULS = 40; // aboard the Blackbird when her reactor scrammed

// normal dock: swing round the ship as you slide past the carrier, catch
// the pods falling in astern, settle back into the chase slot
const DOCK_SHOTS = [
  { dur: 3.0, az: [10, 62], el: [16, 9], d: [70, 100], look: ["ship", "ship"], spd: 170 },
  { dur: 3.2, az: [150, 115], el: [10, 18], d: [150, 120], look: ["ship", "ship"], spd: 170 },
  { dur: 2.3, az: [-28, 0], el: [26, 16], d: [125, 156], look: ["ship", "ahead"], spd: 420 },
];

// finale: same approach, then run, turn the lens back on the carrier
const FINALE_SHOTS = [
  DOCK_SHOTS[0],
  DOCK_SHOTS[1],
  { dur: 1.9, az: [-30, -8], el: [20, 12], d: [100, 140], look: ["ship", "ahead"], spd: 950 },
  { dur: 4.8, az: [168, 182], el: [10, 13], d: [115, 150], look: ["mid", "wreck"], spd: 700 },
  { dur: 3.2, az: [182, 196], el: [13, 20], d: [150, 230], look: ["wreck", "wreck"], spd: 260 },
];

export const LEGS = [
  {
    title: "LIGHTS OUT",
    souls: 14,
    open: [
      ["MAGS", "Runner, this is Mags on the Blackbird. You're the only ship we can raise."],
      ["JUNO", "Thread the old relay rings. Each one you light carries our signal to you."],
      ["MAGS", "Miss one and the chain goes dark. Then we lose you."],
    ],
    beats: [
      { at: 0.82, say: [["JUNO", "Batteries at forty percent. I'm stealing power from the galley."],
        ["MAGS", "She means no coffee. Hurry."]] },
      { at: 0.62, say: [["MAGS", "Contacts on her flank. Scavenger flares."]] },
      { at: 0.5, say: [["ORREN", "I'm Orren. Every relay you light, my pack sees."],
        ["ORREN", "Follow the lights, little runner. We'll be waiting."]] },
      { at: 0.32, say: [["HALE", "Ignore him, Runner. Airlock three is yours."]] },
      { at: 0.14, say: [["JUNO", "Twelve percent. Lights are going out deck by deck."]] },
      { at: 0.035, say: [["MAGS", "We see your running lights. Bring her in slow."]] },
    ],
    dock: {
      shots: DOCK_SHOTS,
      cues: [
        { t: 0, now: true, say: [["MAGS", "Clamps hold. Pods are dropping."],
          ["JUNO", "Fourteen out. They're tucked in behind you."],
          ["HALE", "Run them clear, then come back. We're drifting."]] },
        { t: 0.9, act: "pods" },
      ],
    },
  },
  {
    title: "BOARDERS",
    souls: 18,
    open: [
      ["MAGS", "Relay has a new fix. She's drifting deeper."],
      ["JUNO", "Uh, Mags? Something's cutting on the aft hatch."],
    ],
    beats: [
      { at: 0.82, say: [["MAGS", "Gnaw boarding party, aft section. Deck seven."]] },
      { at: 0.68, say: [["JUNO", "I'm in the battery room. They're right outside the door."]] },
      { at: 0.54, say: [["ORREN", "Hello, Hale. It's been a long time."],
        ["HALE", "Cut that channel."]] },
      { at: 0.44, say: [["ORREN", "Tell the courier who left me out here, Captain."]] },
      { at: 0.34, say: [["MAGS", "Captain... you know him?"],
        ["HALE", "He was my XO. I left him in the Drift. I thought he was dead."]] },
      { at: 0.22, say: [["ORREN", "I'm not here for scrap, courier. I want her core."],
        ["ORREN", "And I want him."]] },
      { at: 0.1, say: [["JUNO", "They're through the first door. Runner, please."]] },
      { at: 0.03, say: [["MAGS", "Aft lock is yours. Pull Juno's section out."]] },
    ],
    dock: {
      shots: DOCK_SHOTS,
      cues: [
        { t: 0, now: true, say: [["MAGS", "Eighteen pods clear. Juno, you're not on them."],
          ["JUNO", "Batteries die without me. Next trip."],
          ["HALE", "Runner. Once more. That's all I'll ask."]] },
        { t: 0.9, act: "pods" },
      ],
    },
  },
  {
    title: "CRITICAL",
    souls: 7,
    open: [
      ["MAGS", "Reactor's waking up. That shouldn't be possible."],
      ["JUNO", "It's not a restart. Someone's overloading it from the bridge."],
      ["HALE", "That's me. Orren wants the core. He can have all of it."],
    ],
    beats: [
      { at: 0.8, say: [["MAGS", "Captain, you can't."],
        ["HALE", "Get my crew off, Mags. That means you too."]] },
      { at: 0.6, say: [["ORREN", "You'd burn your own ship, Hale? You burned me first."]] },
      { at: 0.42, say: [["JUNO", "Containment's at thirty percent. We have minutes."]] },
      { at: 0.24, say: [["HALE", "Runner. When you dock, don't wait for me."]] },
      { at: 0.03, say: [["MAGS", "Lock's open. Juno and I are in the last pod."]] },
    ],
    // Orren comes out in his own heavy to hold the wreck
    ambush: {
      dist: 3000,
      roster: ["heavy", "drone", "drone"],
      say: [["ORREN", "I'll pull the core off your corpse, courier."],
        ["MAGS", "That heavy is Orren. He's flying it himself."]],
    },
    dock: {
      shots: FINALE_SHOTS,
      cues: [
        { t: 0, now: true, say: [["MAGS", "We're out! Captain, you're next."],
          ["HALE", "Not this time."]] },
        { t: 0.9, act: "pods" },
        { t: 6.1, now: true, say: [["HALE", "Tell them I stayed. Blackbird out."]] },
        { t: 9.3, act: "boom" },
        { t: 11.6, now: true, say: [["MAGS", "...She's gone."],
          ["JUNO", "Thirty-nine. You got thirty-nine of us out."]] },
        { t: 13.4, act: "card" },
      ],
    },
  },
];

// Orren's last word if you kill his heavy before the reactor does
export const ORREN_DOWN = [["ORREN", "Tell Hale... I'll wait for him."]];

// after the end card: the Drift is yours
export const ENDLESS = [["MAGS", "The Drift is yours, Runner. Fly as long as you like."]];

// blew past the wreck without docking - the relay re-fixes her ahead
export const OVERSHOOT = [["MAGS", "You overshot her. Relay's swinging the fix around."]];

// gate-wave flavour, one line at most, only when the radio is quiet.
// The Gnaw hunt by relay light - every few lit rings draws a wave.
// keyed by legs completed; index 3 = endless
export const WAVES = [
  [["MAGS", "Your relay light drew them. Gnaw on your six."],
    ["ORREN", "Follow the lights, little runner."]],
  [["MAGS", "They're hunting the relay light. Shake them."],
    ["ORREN", "Every minute you spend on my pack, I'm closer to Hale."]],
  [["JUNO", "Containment's dropping. Don't play with them."],
    ["ORREN", "My pack is hungry, courier."]],
  [["MAGS", "Pack stragglers. Nobody's leading them now."],
    ["MAGS", "More scavengers. Clean them up."]],
];
