export type DocumentNode = import("@humanwhocodes/momoa").DocumentNode;
export type JSONNode = import("@humanwhocodes/momoa").Node;
export type JSONToken = import("@humanwhocodes/momoa").Token;
export type SourceRange = import("@eslint/core").SourceRange;
export type SourceLocation = import("@eslint/core").SourceLocation;
export type File = import("@eslint/core").File;
export type TraversalStep = import("@eslint/core").TraversalStep;
export type VisitTraversalStep = import("@eslint/core").VisitTraversalStep;
export type FileProblem = import("@eslint/core").FileProblem;
export type DirectiveType = import("@eslint/core").DirectiveType;
export type RulesConfig = import("@eslint/core").RulesConfig;
export type IJSONSourceCode = import("./types.ts").IJSONSourceCode;
export type JSONSyntaxElement = import("./types.ts").JSONSyntaxElement;
export type Language = import("@eslint/core").Language;
export type OkParseResult = import("@eslint/core").OkParseResult<DocumentNode>;
export type ParseResult = import("@eslint/core").ParseResult<DocumentNode>;
export type IJSONLanguage = import("./types.ts").IJSONLanguage;
export type JSONLanguageOptions = import("./types.ts").JSONLanguageOptions;
export type NoDuplicateKeysMessageIds = "duplicateKey";
export type NoDuplicateKeysRuleDefinition = import("./types.ts").JSONRuleDefinition<[], NoDuplicateKeysMessageIds>;
export type MemberNode = import("@humanwhocodes/momoa").MemberNode;
export type NoEmptyKeysMessageIds = "emptyKey";
export type NoEmptyKeysRuleDefinition = import("./types.ts").JSONRuleDefinition<[], NoEmptyKeysMessageIds>;
export type NoUnsafeValuesMessageIds = "unsafeNumber" | "unsafeInteger" | "unsafeZero" | "subnormal" | "loneSurrogate";
export type NoUnsafeValuesRuleDefinition = import("./types.ts").JSONRuleDefinition<[], NoUnsafeValuesMessageIds>;
export type NoUnnormalizedKeysMessageIds = "unnormalizedKey";
export type NoUnnormalizedKeysRuleDefinition = import("./types.ts").JSONRuleDefinition<[{
    form: string;
}], NoUnnormalizedKeysMessageIds>;
export type SortKeysMessageIds = "sortKeys";
export type SortOptions = {
    caseSensitive: boolean;
    natural: boolean;
    minKeys: number;
    allowLineSeparatedGroups: boolean;
};
export type SortDirection = "asc" | "desc";
export type SortKeysRuleOptions = [SortDirection, SortOptions];
export type SortKeysRuleDefinition = import("./types.ts").JSONRuleDefinition<SortKeysRuleOptions, SortKeysMessageIds>;
export type Comparator = (a: string, b: string) => boolean;
export type TopLevelInteropMessageIds = "topLevel";
export type TopLevelInteropRuleDefinition = import("./types.ts").JSONRuleDefinition<[], TopLevelInteropMessageIds>;
/**
 * @filedescription Functions to fix up rules to provide missing methods on the `context` object.
 * @author Nicholas C. Zakas
 */
/** @typedef {import("@eslint/core").Language} Language */
/** @typedef {import("@eslint/core").OkParseResult<DocumentNode>} OkParseResult */
/** @typedef {import("@eslint/core").ParseResult<DocumentNode>} ParseResult */
/** @typedef {import("./types.ts").IJSONLanguage} IJSONLanguage */
/** @typedef {import("./types.ts").JSONLanguageOptions} JSONLanguageOptions */
/**
 * JSON Language Object
 * @implements {IJSONLanguage}
 */
export class JSONLanguage implements IJSONLanguage {
    /**
     * Creates a new instance.
     * @param {Object} options The options to use for this instance.
     * @param {"json"|"jsonc"|"json5"} options.mode The parser mode to use.
     */
    constructor({ mode }: {
        mode: "json" | "jsonc" | "json5";
    });
    /**
     * The type of file to read.
     * @type {"text"}
     */
    fileType: "text";
    /**
     * The line number at which the parser starts counting.
     * @type {0|1}
     */
    lineStart: 0 | 1;
    /**
     * The column number at which the parser starts counting.
     * @type {0|1}
     */
    columnStart: 0 | 1;
    /**
     * The name of the key that holds the type of the node.
     * @type {string}
     */
    nodeTypeKey: string;
    /**
     * The visitor keys.
     * @type {Record<string, string[]>}
     */
    visitorKeys: Record<string, string[]>;
    /**
     * Validates the language options.
     * @param {JSONLanguageOptions} languageOptions The language options to validate.
     * @returns {void}
     * @throws {Error} When the language options are invalid.
     */
    validateLanguageOptions(languageOptions: JSONLanguageOptions): void;
    /**
     * Parses the given file into an AST.
     * @param {File} file The virtual file to parse.
     * @param {{languageOptions: JSONLanguageOptions}} context The options to use for parsing.
     * @returns {ParseResult} The result of parsing.
     */
    parse(file: File, context: {
        languageOptions: JSONLanguageOptions;
    }): ParseResult;
    /**
     * Creates a new `JSONSourceCode` object from the given information.
     * @param {File} file The virtual file to create a `JSONSourceCode` object from.
     * @param {OkParseResult} parseResult The result returned from `parse()`.
     * @returns {JSONSourceCode} The new `JSONSourceCode` object.
     */
    createSourceCode(file: File, parseResult: OkParseResult): JSONSourceCode;
    #private;
}
/**
 * JSON Source Code Object
 * @implements {IJSONSourceCode}
 */
export class JSONSourceCode extends TextSourceCodeBase implements IJSONSourceCode {
    /**
     * Creates a new instance.
     * @param {Object} options The options for the instance.
     * @param {string} options.text The source code text.
     * @param {DocumentNode} options.ast The root AST node.
     */
    constructor({ text, ast }: {
        text: string;
        ast: DocumentNode;
    });
    /**
     * The AST of the source code.
     * @type {DocumentNode}
     */
    ast: DocumentNode;
    /**
     * The comment node in the source code.
     * @type {Array<JSONToken>|undefined}
     */
    comments: Array<JSONToken> | undefined;
    /**
     * Returns an array of all inline configuration nodes found in the
     * source code.
     * @returns {Array<JSONToken>} An array of all inline configuration nodes.
     */
    getInlineConfigNodes(): Array<JSONToken>;
    /**
     * Returns directives that enable or disable rules along with any problems
     * encountered while parsing the directives.
     * @returns {{problems:Array<FileProblem>,directives:Array<Directive>}} Information
     *      that ESLint needs to further process the directives.
     */
    getDisableDirectives(): {
        problems: Array<FileProblem>;
        directives: Array<Directive>;
    };
    /**
     * Returns inline rule configurations along with any problems
     * encountered while parsing the configurations.
     * @returns {{problems:Array<FileProblem>,configs:Array<{config:{rules:RulesConfig},loc:SourceLocation}>}} Information
     *      that ESLint needs to further process the rule configurations.
     */
    applyInlineConfig(): {
        problems: Array<FileProblem>;
        configs: Array<{
            config: {
                rules: RulesConfig;
            };
            loc: SourceLocation;
        }>;
    };
    /**
     * Returns the parent of the given node.
     * @param {JSONNode} node The node to get the parent of.
     * @returns {JSONNode|undefined} The parent of the node.
     */
    getParent(node: JSONNode): JSONNode | undefined;
    /**
     * Traverse the source code and return the steps that were taken.
     * @returns {Iterable<JSONTraversalStep>} The steps that were taken while traversing the source code.
     */
    traverse(): Iterable<JSONTraversalStep>;
    #private;
}
declare namespace plugin {
    namespace meta {
        let name: string;
        let version: string;
    }
    namespace languages {
        let json: JSONLanguage;
        let jsonc: JSONLanguage;
        let json5: JSONLanguage;
    }
    let rules: {
        "no-duplicate-keys": NoDuplicateKeysRuleDefinition;
        "no-empty-keys": NoEmptyKeysRuleDefinition;
        "no-unsafe-values": NoUnsafeValuesRuleDefinition;
        "no-unnormalized-keys": NoUnnormalizedKeysRuleDefinition;
        "sort-keys": SortKeysRuleDefinition;
        "top-level-interop": TopLevelInteropRuleDefinition;
    };
    namespace configs {
        namespace recommended {
            export let plugins: {};
            let rules_1: {
                readonly "json/no-duplicate-keys": "error";
                readonly "json/no-empty-keys": "error";
                readonly "json/no-unsafe-values": "error";
                readonly "json/no-unnormalized-keys": "error";
            };
            export { rules_1 as rules };
        }
    }
}
import { TextSourceCodeBase } from '@eslint/plugin-kit';
import { Directive } from '@eslint/plugin-kit';
/**
 * A class to represent a step in the traversal process.
 */
declare class JSONTraversalStep extends VisitNodeStep {
    /**
     * Creates a new instance.
     * @param {Object} options The options for the step.
     * @param {JSONNode} options.target The target of the step.
     * @param {1|2} options.phase The phase of the step.
     * @param {Array<any>} options.args The arguments of the step.
     */
    constructor({ target, phase, args }: {
        target: JSONNode;
        phase: 1 | 2;
        args: Array<any>;
    });
    /**
     * The target of the step.
     * @type {JSONNode}
     */
    target: JSONNode;
}
import { VisitNodeStep } from '@eslint/plugin-kit';
export { plugin as default };
