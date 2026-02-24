// CodeMirror entry point for playground bundling
// Bundled by Bun.build() and inlined into the playground HTML
// Assigns all needed exports to window globals

import {basicSetup} from 'codemirror';
import {EditorState, StateField, StateEffect, Compartment} from '@codemirror/state';
import {EditorView, keymap, Decoration} from '@codemirror/view';
import {StreamLanguage, HighlightStyle, syntaxHighlighting} from '@codemirror/language';
import {oneDark} from '@codemirror/theme-one-dark';
import {autocompletion} from '@codemirror/autocomplete';
import {tags} from '@lezer/highlight';

Object.assign(window, {
  basicSetup, EditorState, StateField, StateEffect, Compartment,
  EditorView, keymap, Decoration,
  StreamLanguage, HighlightStyle, syntaxHighlighting,
  oneDark, autocompletion, tags
});
