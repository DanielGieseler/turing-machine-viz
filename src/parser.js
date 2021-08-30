'use strict';

var TM = require('./TuringMachine'),
    jsyaml = require('js-yaml'),
    _ = require('lodash');

/**
 * Thrown when parsing a string that is valid as YAML but invalid
 * as a machine specification.
 *
 * Examples: unrecognized synonym, no start state defined,
 * transitioning to an undeclared state.
 *
 * A readable message is generated based on the details (if any) provided.
 * @param {string} reason  A readable error code.
 *   As an error code, this should be relatively short and not include runtime values.
 * @param {?Object} details Optional details. Possible keys:
 *                          problemValue, state, key, synonym, info, suggestion
 */
function TMSpecError(reason, details) {
  this.name = 'TMSpecError';
  this.stack = (new Error()).stack;

  this.reason = reason;
  this.details = details || {};
}
TMSpecError.prototype = Object.create(Error.prototype);
TMSpecError.prototype.constructor = TMSpecError;

// generate a formatted description in HTML
Object.defineProperty(TMSpecError.prototype, 'message', {
  get: function () {
    var header = this.reason;
    var details = this.details;

    function code(str) { return '<code>' + str + '</code>'; }
    function showLoc(state, symbol, synonym) {
      if (state != null) {
        if (symbol != null) {
          return ' in the transition from state ' + code(state) + ' and symbol ' + code(symbol);
        } else {
          return ' for state ' + code(state);
        }
      } else if (synonym != null) {
        return ' in the definition of synonym ' + code(synonym);
      }
      return '';
    }
    var problemValue = details.problemValue ? ' ' + code(details.problemValue) : '';
    var location = showLoc(details.state, details.symbol, details.synonym);
    var sentences = ['<strong>' + header + problemValue + '</strong>' + location
      , details.info, details.suggestion]
      .filter(_.identity)
      .map(function (s) { return s + '.'; });
    if (location) { sentences.splice(1, 0, '<br>'); }
    return sentences.join(' ');
  },
  enumerable: true
});

// type TransitionTable = {[key: string]: ?{[key: string]: string} }
// type TMSpec = {blank: string, start state: string, table: TransitionTable}

// IDEA: check with flow (flowtype.org)
// throws YAMLException on YAML syntax error
// throws TMSpecError for an invalid spec (eg. no start state, transitioning to an undefined state)
// string -> TMSpec
function parseSpec(str) {
  var obj = jsyaml.safeLoad(str);
  // check for required object properties.
  // auto-convert .blank and 'start state' to string, for convenience.
  if (obj == null) { throw new TMSpecError('The document is empty',
    {info: 'Every Turing machine requires a <code>blank</code> tape symbol,' +
    ' a <code>start state</code>, and a transition <code>table</code>'}); }
  var detailsForBlank = {suggestion:
    'Examples: <code>blank: \' \'</code>, <code>blank: \'0\'</code>'};
  if (obj.blank == null) {
    throw new TMSpecError('No blank symbol was specified', detailsForBlank);
  }
  obj.blank = String(obj.blank);
  if (obj.blank.length !== 1) {
    throw new TMSpecError('The blank symbol must be a string of length 1', detailsForBlank);
  }
  obj.startState = obj['start state'];
  delete obj['start state'];
  if (obj.startState == null) {
    throw new TMSpecError('No start state was specified',
    {suggestion: 'Assign one using <code>start state: </code>'});
  }
  obj.startState = String(obj.startState);
  // parse synonyms and transition table
  checkTableType(obj.table); // parseSynonyms assumes a table object
  var synonyms = parseSynonyms(obj.synonyms, obj.table);
  obj.table = parseTable(synonyms, obj.table);
  // check for references to non-existent states
  if (!(obj.startState in obj.table)) {
    throw new TMSpecError('The start state has to be declared in the transition table');
  }

  return obj;
}

function checkTableType(val) {
  if (val == null) {
    throw new TMSpecError('Missing transition table',
    {suggestion: 'Specify one using <code>table:</code>'});
  }
  if (typeof val !== 'object') {
    throw new TMSpecError('Transition table has an invalid type',
    {problemValue: typeof val,
    info: 'The transition table should be a nested mapping from states to symbols to instructions'});
  }
}

// (any, Object) -> ?SynonymMap
function parseSynonyms(val, table) {
  if (val == null) {
    return null;
  }
  if (typeof val !== 'object') {
    throw new TMSpecError('Synonyms table has an invalid type',
      {problemValue: typeof val,
      info: 'Synonyms should be a mapping from string abbreviations to instructions'
        + ' (e.g. <code>accept: {R: accept}</code>)'});
  }
  return _.mapValues(val, function (actionVal, key) {
    try {
      return parseInstruction(null, table, actionVal);
    } catch (e) {
      if (e instanceof TMSpecError) {
        e.details.synonym = key;
        if (e.reason === 'Unrecognized string') {
          e.details.info = 'Note that a synonym cannot be defined using another synonym';
        }
      }
      throw e;
    }
  });
}

// (?SynonymMap, {[key: string]: string}) -> TransitionTable
function parseTable(synonyms, val) {
  return _.mapValues(val, function (stateObj, state) {
    if (stateObj == null) {
      // case: halting state
      return null;
    }
    if (typeof stateObj !== 'object') {
      throw new TMSpecError('State entry has an invalid type',
      {problemValue: typeof stateObj, state: state,
      info: 'Each state should map symbols to instructions. An empty map signifies a halting state.'});
    }
    return _.mapValues(stateObj, function (actionVal, symbol) {
      try {
        return parseInstruction(synonyms, val, actionVal);
      } catch (e) {
        if (e instanceof TMSpecError) {
          e.details.state = state;
          e.details.symbol = symbol;
        }
        throw e;
      }
    });
  });
}

// omits null/undefined properties
// (?string, direction, ?string) -> {symbol?: string, move: direction, state?: string}
function makeInstruction(symbol, move, state) {
  return Object.freeze(_.omitBy({symbol: symbol, move: move, state: state},
    function (x) { return x == null; }));
}

function checkTarget(table, instruct) {
  if (instruct.state != null && !(instruct.state in table)) {
    throw new TMSpecError('Undeclared state', {problemValue: instruct.state,
    suggestion: 'Make sure to list all states in the transition table and define their transitions (if any)'});
  }
  return instruct;
}

// throws if the target state is undeclared (not in the table)
// type SynonymMap = {[key: string]: TMAction}
// (SynonymMap?, Object, string | Object) -> TMAction
function parseInstruction(synonyms, table, val) {
  return checkTarget(table, function () {
    switch (typeof val) {
      case 'string': return parseInstructionNew(val);
      default: throw new TMSpecError('Invalid instruction type',
        {problemValue: typeof val,
          info: 'An instruction can be a string (a direction <code>L</code>/<code>R</code> or a synonym)'
            + ' or a mapping (examples: <code>{R: accept}</code>, <code>{write: \' \', L: start}</code>)'});
    }
  }());
}


function parseInstructionNew(val) {
	const commands = val.split(' ')
	if (commands.length != 2){
		throw new TMSpecError('Exactly two instructions are required');
	}

	var symbol, move, state;

	// WRITE and MOVE
	var c1 = commands[0];
	if (c1.length != 1) {
		throw new TMSpecError('Operation require a string of length 1');
	}
	if (c1 == 'L'){
		move = TM.MoveHead.left;
	} else if (c1 == 'R') {
		move = TM.MoveHead.right;
	} else {
		symbol = c1;
	}

	// NEXT STATE
	state = commands[1];

	return makeInstruction(symbol, move, state);
}




exports.TMSpecError = TMSpecError;
exports.parseSpec = parseSpec;
// re-exports
exports.YAMLException = jsyaml.YAMLException;
