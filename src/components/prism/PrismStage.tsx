"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrismApp, type PrismState } from "@/lib/prism/app";
import "@/lib/prism/prism.css";
import "@/lib/prism/premium.css";
import CommandPalette from "./CommandPalette";
import ShortcutLegend from "./ShortcutLegend";
import PresetTransitionOverlay from "./PresetTransitionOverlay";
import InputModeIndicator from "./InputModeIndicator";
import PrismToast from "./PrismToast";
import SettingsPanel from "./SettingsPanel";
import PrismCinematicIntro from "./PrismCinematicIntro";
