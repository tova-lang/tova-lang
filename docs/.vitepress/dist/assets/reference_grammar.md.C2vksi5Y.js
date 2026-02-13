import{_ as s,o as a,c as t,ag as o}from"./chunks/framework.DEqXEGcv.js";const d=JSON.parse('{"title":"Grammar","description":"","frontmatter":{},"headers":[],"relativePath":"reference/grammar.md","filePath":"reference/grammar.md"}'),e={name:"reference/grammar.md"};function p(l,n,u,i,q,c){return a(),t("div",null,[...n[0]||(n[0]=[o(`<h1 id="grammar" tabindex="-1">Grammar <a class="header-anchor" href="#grammar" aria-label="Permalink to &quot;Grammar&quot;">​</a></h1><p>This appendix provides the complete EBNF (Extended Backus-Naur Form) grammar for the Lux programming language, derived from the parser and lexer source code.</p><h2 id="notation" tabindex="-1">Notation <a class="header-anchor" href="#notation" aria-label="Permalink to &quot;Notation&quot;">​</a></h2><table tabindex="0"><thead><tr><th>Symbol</th><th>Meaning</th></tr></thead><tbody><tr><td><code>=</code></td><td>Definition</td></tr><tr><td><code>|</code></td><td>Alternative</td></tr><tr><td><code>[ ]</code></td><td>Optional (zero or one)</td></tr><tr><td><code>{ }</code></td><td>Repetition (zero or more)</td></tr><tr><td><code>( )</code></td><td>Grouping</td></tr><tr><td><code>&quot;...&quot;</code></td><td>Terminal string</td></tr><tr><td><code>UPPER</code></td><td>Token type</td></tr><tr><td><code>lower</code></td><td>Non-terminal</td></tr></tbody></table><h2 id="lexical-grammar" tabindex="-1">Lexical Grammar <a class="header-anchor" href="#lexical-grammar" aria-label="Permalink to &quot;Lexical Grammar&quot;">​</a></h2><h3 id="tokens" tabindex="-1">Tokens <a class="header-anchor" href="#tokens" aria-label="Permalink to &quot;Tokens&quot;">​</a></h3><div class="language-ebnf vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ebnf</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>token = NUMBER | STRING | STRING_TEMPLATE | BOOLEAN | NIL</span></span>
<span class="line"><span>      | IDENTIFIER | keyword | operator | delimiter</span></span>
<span class="line"><span>      | DOCSTRING | NEWLINE | EOF ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>keyword = &quot;var&quot; | &quot;let&quot; | &quot;fn&quot; | &quot;return&quot; | &quot;if&quot; | &quot;elif&quot; | &quot;else&quot;</span></span>
<span class="line"><span>        | &quot;for&quot; | &quot;while&quot; | &quot;match&quot; | &quot;type&quot; | &quot;import&quot; | &quot;from&quot;</span></span>
<span class="line"><span>        | &quot;export&quot; | &quot;as&quot; | &quot;and&quot; | &quot;or&quot; | &quot;not&quot; | &quot;in&quot;</span></span>
<span class="line"><span>        | &quot;true&quot; | &quot;false&quot; | &quot;nil&quot; | &quot;try&quot; | &quot;catch&quot; | &quot;finally&quot;</span></span>
<span class="line"><span>        | &quot;break&quot; | &quot;continue&quot; | &quot;async&quot; | &quot;await&quot; | &quot;guard&quot;</span></span>
<span class="line"><span>        | &quot;interface&quot; | &quot;derive&quot; | &quot;pub&quot; | &quot;impl&quot; | &quot;trait&quot;</span></span>
<span class="line"><span>        | &quot;defer&quot; | &quot;yield&quot; | &quot;extern&quot;</span></span>
<span class="line"><span>        | &quot;server&quot; | &quot;client&quot; | &quot;shared&quot; | &quot;route&quot;</span></span>
<span class="line"><span>        | &quot;state&quot; | &quot;computed&quot; | &quot;effect&quot; | &quot;component&quot; | &quot;store&quot; ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>http_method = &quot;GET&quot; | &quot;POST&quot; | &quot;PUT&quot; | &quot;DELETE&quot; | &quot;PATCH&quot; | &quot;HEAD&quot; | &quot;OPTIONS&quot; ;</span></span></code></pre></div><h3 id="number-literals" tabindex="-1">Number Literals <a class="header-anchor" href="#number-literals" aria-label="Permalink to &quot;Number Literals&quot;">​</a></h3><div class="language-ebnf vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ebnf</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>number = decimal_number | hex_number | binary_number | octal_number ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>decimal_number = digit { digit | &quot;_&quot; } [ &quot;.&quot; digit { digit | &quot;_&quot; } ]</span></span>
<span class="line"><span>                 [ ( &quot;e&quot; | &quot;E&quot; ) [ &quot;+&quot; | &quot;-&quot; ] digit { digit } ] ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>hex_number     = &quot;0&quot; ( &quot;x&quot; | &quot;X&quot; ) hex_digit { hex_digit | &quot;_&quot; } ;</span></span>
<span class="line"><span>binary_number  = &quot;0&quot; ( &quot;b&quot; | &quot;B&quot; ) bin_digit { bin_digit | &quot;_&quot; } ;</span></span>
<span class="line"><span>octal_number   = &quot;0&quot; ( &quot;o&quot; | &quot;O&quot; ) oct_digit { oct_digit | &quot;_&quot; } ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>digit     = &quot;0&quot; | &quot;1&quot; | &quot;2&quot; | &quot;3&quot; | &quot;4&quot; | &quot;5&quot; | &quot;6&quot; | &quot;7&quot; | &quot;8&quot; | &quot;9&quot; ;</span></span>
<span class="line"><span>hex_digit = digit | &quot;a&quot; | &quot;b&quot; | &quot;c&quot; | &quot;d&quot; | &quot;e&quot; | &quot;f&quot;</span></span>
<span class="line"><span>          | &quot;A&quot; | &quot;B&quot; | &quot;C&quot; | &quot;D&quot; | &quot;E&quot; | &quot;F&quot; ;</span></span>
<span class="line"><span>bin_digit = &quot;0&quot; | &quot;1&quot; ;</span></span>
<span class="line"><span>oct_digit = &quot;0&quot; | &quot;1&quot; | &quot;2&quot; | &quot;3&quot; | &quot;4&quot; | &quot;5&quot; | &quot;6&quot; | &quot;7&quot; ;</span></span></code></pre></div><h3 id="string-literals" tabindex="-1">String Literals <a class="header-anchor" href="#string-literals" aria-label="Permalink to &quot;String Literals&quot;">​</a></h3><div class="language-ebnf vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ebnf</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>double_string  = &#39;&quot;&#39; { string_char | escape_seq | interpolation } &#39;&quot;&#39; ;</span></span>
<span class="line"><span>single_string  = &quot;&#39;&quot; { string_char | escape_seq } &quot;&#39;&quot; ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>string_char    = any character except &#39;&quot;&#39;, &quot;&#39;&quot;, &quot;\\&quot;, &quot;{&quot; ;</span></span>
<span class="line"><span>escape_seq     = &quot;\\&quot; ( &quot;n&quot; | &quot;t&quot; | &quot;r&quot; | &quot;\\&quot; | &#39;&quot;&#39; | &quot;&#39;&quot; | &quot;{&quot; ) ;</span></span>
<span class="line"><span>interpolation  = &quot;{&quot; expression &quot;}&quot; ;</span></span></code></pre></div><h3 id="identifiers" tabindex="-1">Identifiers <a class="header-anchor" href="#identifiers" aria-label="Permalink to &quot;Identifiers&quot;">​</a></h3><div class="language-ebnf vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ebnf</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>identifier = ( letter | &quot;_&quot; ) { letter | digit | &quot;_&quot; } ;</span></span>
<span class="line"><span>letter     = &quot;a&quot;..&quot;z&quot; | &quot;A&quot;..&quot;Z&quot; ;</span></span></code></pre></div><h3 id="comments" tabindex="-1">Comments <a class="header-anchor" href="#comments" aria-label="Permalink to &quot;Comments&quot;">​</a></h3><div class="language-ebnf vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ebnf</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>line_comment  = &quot;//&quot; { any_char } newline ;</span></span>
<span class="line"><span>doc_comment   = &quot;///&quot; { any_char } newline ;</span></span>
<span class="line"><span>block_comment = &quot;/*&quot; { any_char | block_comment } &quot;*/&quot; ;</span></span></code></pre></div><h3 id="operators-and-delimiters" tabindex="-1">Operators and Delimiters <a class="header-anchor" href="#operators-and-delimiters" aria-label="Permalink to &quot;Operators and Delimiters&quot;">​</a></h3><div class="language-ebnf vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ebnf</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>operator = &quot;+&quot; | &quot;-&quot; | &quot;*&quot; | &quot;/&quot; | &quot;%&quot; | &quot;**&quot;</span></span>
<span class="line"><span>         | &quot;=&quot; | &quot;==&quot; | &quot;!=&quot; | &quot;&lt;&quot; | &quot;&lt;=&quot; | &quot;&gt;&quot; | &quot;&gt;=&quot;</span></span>
<span class="line"><span>         | &quot;&amp;&amp;&quot; | &quot;||&quot; | &quot;!&quot; | &quot;|&gt;&quot;</span></span>
<span class="line"><span>         | &quot;=&gt;&quot; | &quot;-&gt;&quot; | &quot;.&quot; | &quot;..&quot; | &quot;..=&quot; | &quot;...&quot;</span></span>
<span class="line"><span>         | &quot;:&quot; | &quot;::&quot; | &quot;?&quot; | &quot;?.&quot; | &quot;??&quot;</span></span>
<span class="line"><span>         | &quot;+=&quot; | &quot;-=&quot; | &quot;*=&quot; | &quot;/=&quot; ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>delimiter = &quot;(&quot; | &quot;)&quot; | &quot;{&quot; | &quot;}&quot; | &quot;[&quot; | &quot;]&quot; | &quot;,&quot; | &quot;;&quot; ;</span></span></code></pre></div><h2 id="program-structure" tabindex="-1">Program Structure <a class="header-anchor" href="#program-structure" aria-label="Permalink to &quot;Program Structure&quot;">​</a></h2><div class="language-ebnf vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ebnf</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>program = { top_level_statement } EOF ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>top_level_statement = server_block</span></span>
<span class="line"><span>                    | client_block</span></span>
<span class="line"><span>                    | shared_block</span></span>
<span class="line"><span>                    | test_block</span></span>
<span class="line"><span>                    | import_declaration</span></span>
<span class="line"><span>                    | statement ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>server_block = &quot;server&quot; [ STRING ] &quot;{&quot; { server_statement } &quot;}&quot; ;</span></span>
<span class="line"><span>client_block = &quot;client&quot; [ STRING ] &quot;{&quot; { client_statement } &quot;}&quot; ;</span></span>
<span class="line"><span>shared_block = &quot;shared&quot; [ STRING ] &quot;{&quot; { statement } &quot;}&quot; ;</span></span>
<span class="line"><span>test_block   = &quot;test&quot;   [ STRING ] &quot;{&quot; { statement } &quot;}&quot; ;</span></span></code></pre></div><h2 id="server-statements" tabindex="-1">Server Statements <a class="header-anchor" href="#server-statements" aria-label="Permalink to &quot;Server Statements&quot;">​</a></h2><div class="language-ebnf vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ebnf</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>server_statement = route_declaration</span></span>
<span class="line"><span>                 | route_group_declaration</span></span>
<span class="line"><span>                 | middleware_declaration</span></span>
<span class="line"><span>                 | db_declaration</span></span>
<span class="line"><span>                 | model_declaration</span></span>
<span class="line"><span>                 | auth_declaration</span></span>
<span class="line"><span>                 | cors_declaration</span></span>
<span class="line"><span>                 | rate_limit_declaration</span></span>
<span class="line"><span>                 | health_check_declaration</span></span>
<span class="line"><span>                 | error_handler_declaration</span></span>
<span class="line"><span>                 | websocket_declaration</span></span>
<span class="line"><span>                 | sse_declaration</span></span>
<span class="line"><span>                 | static_declaration</span></span>
<span class="line"><span>                 | env_declaration</span></span>
<span class="line"><span>                 | session_declaration</span></span>
<span class="line"><span>                 | upload_declaration</span></span>
<span class="line"><span>                 | tls_declaration</span></span>
<span class="line"><span>                 | compression_declaration</span></span>
<span class="line"><span>                 | cache_declaration</span></span>
<span class="line"><span>                 | max_body_declaration</span></span>
<span class="line"><span>                 | schedule_declaration</span></span>
<span class="line"><span>                 | background_job_declaration</span></span>
<span class="line"><span>                 | lifecycle_hook_declaration</span></span>
<span class="line"><span>                 | discover_declaration</span></span>
<span class="line"><span>                 | subscribe_declaration</span></span>
<span class="line"><span>                 | statement ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>route_declaration = &quot;route&quot; http_method STRING [ &quot;with&quot; decorator_list ] &quot;=&gt;&quot; expression ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>route_group_declaration = &quot;routes&quot; STRING &quot;{&quot; { server_statement } &quot;}&quot; ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>decorator_list = decorator { &quot;,&quot; decorator } ;</span></span>
<span class="line"><span>decorator      = IDENTIFIER [ &quot;(&quot; expression_list &quot;)&quot; ] ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>middleware_declaration = &quot;middleware&quot; &quot;fn&quot; IDENTIFIER &quot;(&quot; param_list &quot;)&quot; block ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>db_declaration    = &quot;db&quot; &quot;{&quot; object_body &quot;}&quot; ;</span></span>
<span class="line"><span>model_declaration = &quot;model&quot; IDENTIFIER [ &quot;{&quot; object_body &quot;}&quot; ] ;</span></span>
<span class="line"><span>auth_declaration  = &quot;auth&quot; &quot;{&quot; object_body &quot;}&quot; ;</span></span>
<span class="line"><span>cors_declaration  = &quot;cors&quot; &quot;{&quot; object_body &quot;}&quot; ;</span></span>
<span class="line"><span>rate_limit_declaration = &quot;rate_limit&quot; &quot;{&quot; object_body &quot;}&quot; ;</span></span>
<span class="line"><span>health_check_declaration = &quot;health&quot; STRING ;</span></span>
<span class="line"><span>session_declaration    = &quot;session&quot; &quot;{&quot; object_body &quot;}&quot; ;</span></span>
<span class="line"><span>upload_declaration     = &quot;upload&quot; &quot;{&quot; object_body &quot;}&quot; ;</span></span>
<span class="line"><span>tls_declaration        = &quot;tls&quot; &quot;{&quot; object_body &quot;}&quot; ;</span></span>
<span class="line"><span>compression_declaration = &quot;compression&quot; &quot;{&quot; object_body &quot;}&quot; ;</span></span>
<span class="line"><span>cache_declaration      = &quot;cache&quot; &quot;{&quot; object_body &quot;}&quot; ;</span></span>
<span class="line"><span>max_body_declaration   = &quot;max_body&quot; expression ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>error_handler_declaration = &quot;on_error&quot; &quot;fn&quot; &quot;(&quot; param_list &quot;)&quot; block ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>websocket_declaration = &quot;ws&quot; &quot;{&quot; { ws_handler } &quot;}&quot; ;</span></span>
<span class="line"><span>ws_handler = ( &quot;on_open&quot; | &quot;on_message&quot; | &quot;on_close&quot; | &quot;on_error&quot; )</span></span>
<span class="line"><span>             &quot;fn&quot; &quot;(&quot; param_list &quot;)&quot; block ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>sse_declaration = &quot;sse&quot; STRING &quot;fn&quot; &quot;(&quot; param_list &quot;)&quot; block ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>static_declaration = &quot;static&quot; STRING &quot;=&gt;&quot; STRING [ &quot;fallback&quot; STRING ] ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>env_declaration = &quot;env&quot; IDENTIFIER &quot;:&quot; type_annotation [ &quot;=&quot; expression ] ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>schedule_declaration = &quot;schedule&quot; STRING &quot;fn&quot; [ IDENTIFIER ] &quot;(&quot; [ param_list ] &quot;)&quot; block ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>background_job_declaration = &quot;background&quot; &quot;fn&quot; IDENTIFIER &quot;(&quot; [ param_list ] &quot;)&quot; block ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>lifecycle_hook_declaration = ( &quot;on_start&quot; | &quot;on_stop&quot; ) &quot;fn&quot; &quot;(&quot; [ param_list ] &quot;)&quot; block ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>discover_declaration = &quot;discover&quot; STRING &quot;at&quot; expression [ &quot;with&quot; &quot;{&quot; object_body &quot;}&quot; ] ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>subscribe_declaration = &quot;subscribe&quot; STRING &quot;fn&quot; &quot;(&quot; param_list &quot;)&quot; block ;</span></span></code></pre></div><h2 id="client-statements" tabindex="-1">Client Statements <a class="header-anchor" href="#client-statements" aria-label="Permalink to &quot;Client Statements&quot;">​</a></h2><div class="language-ebnf vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ebnf</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>client_statement = state_declaration</span></span>
<span class="line"><span>                 | computed_declaration</span></span>
<span class="line"><span>                 | effect_declaration</span></span>
<span class="line"><span>                 | component_declaration</span></span>
<span class="line"><span>                 | store_declaration</span></span>
<span class="line"><span>                 | statement ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>state_declaration    = &quot;state&quot; IDENTIFIER [ &quot;:&quot; type_annotation ] &quot;=&quot; expression ;</span></span>
<span class="line"><span>computed_declaration = &quot;computed&quot; IDENTIFIER &quot;=&quot; expression ;</span></span>
<span class="line"><span>effect_declaration   = &quot;effect&quot; block ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>component_declaration = &quot;component&quot; IDENTIFIER [ &quot;(&quot; [ param_list ] &quot;)&quot; ] &quot;{&quot; component_body &quot;}&quot; ;</span></span>
<span class="line"><span>component_body = { jsx_element | statement | style_block } ;</span></span>
<span class="line"><span>style_block    = STYLE_BLOCK ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>store_declaration = &quot;store&quot; IDENTIFIER &quot;{&quot; { state_declaration | computed_declaration | function_declaration } &quot;}&quot; ;</span></span></code></pre></div><h2 id="statements" tabindex="-1">Statements <a class="header-anchor" href="#statements" aria-label="Permalink to &quot;Statements&quot;">​</a></h2><div class="language-ebnf vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ebnf</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>statement = assignment</span></span>
<span class="line"><span>          | var_declaration</span></span>
<span class="line"><span>          | let_destructure</span></span>
<span class="line"><span>          | function_declaration</span></span>
<span class="line"><span>          | type_declaration</span></span>
<span class="line"><span>          | import_declaration</span></span>
<span class="line"><span>          | export_statement</span></span>
<span class="line"><span>          | return_statement</span></span>
<span class="line"><span>          | if_statement</span></span>
<span class="line"><span>          | for_statement</span></span>
<span class="line"><span>          | while_statement</span></span>
<span class="line"><span>          | try_catch_statement</span></span>
<span class="line"><span>          | expression_statement ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>assignment = IDENTIFIER { &quot;,&quot; IDENTIFIER } &quot;=&quot; expression { &quot;,&quot; expression } ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>var_declaration = &quot;var&quot; IDENTIFIER { &quot;,&quot; IDENTIFIER } &quot;=&quot; expression { &quot;,&quot; expression } ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>let_destructure = &quot;let&quot; ( object_pattern | array_pattern ) &quot;=&quot; expression ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>function_declaration = &quot;fn&quot; IDENTIFIER &quot;(&quot; [ param_list ] &quot;)&quot; [ &quot;-&gt;&quot; type_annotation ] block ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>param_list = parameter { &quot;,&quot; parameter } ;</span></span>
<span class="line"><span>parameter  = IDENTIFIER [ &quot;:&quot; type_annotation ] [ &quot;=&quot; expression ] ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>type_declaration = &quot;type&quot; IDENTIFIER [ &quot;&lt;&quot; type_param_list &quot;&gt;&quot; ] &quot;{&quot; type_body &quot;}&quot; ;</span></span>
<span class="line"><span>type_param_list  = IDENTIFIER { &quot;,&quot; IDENTIFIER } ;</span></span>
<span class="line"><span>type_body        = { type_variant | type_field } ;</span></span>
<span class="line"><span>type_variant     = IDENTIFIER [ &quot;(&quot; type_field_list &quot;)&quot; ] [ &quot;,&quot; ] ;</span></span>
<span class="line"><span>type_field       = IDENTIFIER &quot;:&quot; type_annotation [ &quot;,&quot; ] ;</span></span>
<span class="line"><span>type_field_list  = type_field { &quot;,&quot; type_field } ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>import_declaration = &quot;import&quot; ( import_specifiers &quot;from&quot; STRING</span></span>
<span class="line"><span>                              | IDENTIFIER &quot;from&quot; STRING ) ;</span></span>
<span class="line"><span>import_specifiers  = &quot;{&quot; import_specifier { &quot;,&quot; import_specifier } &quot;}&quot; ;</span></span>
<span class="line"><span>import_specifier   = IDENTIFIER [ &quot;as&quot; IDENTIFIER ] ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>export_statement = &quot;export&quot; ( function_declaration | type_declaration | statement ) ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>return_statement = &quot;return&quot; [ expression ] ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>if_statement = &quot;if&quot; expression block</span></span>
<span class="line"><span>               { &quot;elif&quot; expression block }</span></span>
<span class="line"><span>               [ &quot;else&quot; block ] ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>for_statement = &quot;for&quot; IDENTIFIER [ &quot;,&quot; IDENTIFIER ] &quot;in&quot; expression block</span></span>
<span class="line"><span>                [ &quot;else&quot; block ] ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>while_statement = &quot;while&quot; expression block ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>try_catch_statement = &quot;try&quot; &quot;{&quot; { statement } &quot;}&quot;</span></span>
<span class="line"><span>                      &quot;catch&quot; [ IDENTIFIER ] &quot;{&quot; { statement } &quot;}&quot; ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>expression_statement = expression ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>block = &quot;{&quot; { statement } &quot;}&quot; ;</span></span></code></pre></div><h2 id="expressions" tabindex="-1">Expressions <a class="header-anchor" href="#expressions" aria-label="Permalink to &quot;Expressions&quot;">​</a></h2><h3 id="precedence-lowest-to-highest" tabindex="-1">Precedence (Lowest to Highest) <a class="header-anchor" href="#precedence-lowest-to-highest" aria-label="Permalink to &quot;Precedence (Lowest to Highest)&quot;">​</a></h3><div class="language-ebnf vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ebnf</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>expression     = pipe_expr ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>pipe_expr      = null_coalesce { &quot;|&gt;&quot; null_coalesce } ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>null_coalesce  = logical_or { &quot;??&quot; logical_or } ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>logical_or     = logical_and { ( &quot;or&quot; | &quot;||&quot; ) logical_and } ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>logical_and    = logical_not { ( &quot;and&quot; | &quot;&amp;&amp;&quot; ) logical_not } ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>logical_not    = ( &quot;not&quot; | &quot;!&quot; ) logical_not | comparison ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>comparison     = membership { ( &quot;&lt;&quot; | &quot;&lt;=&quot; | &quot;&gt;&quot; | &quot;&gt;=&quot; | &quot;==&quot; | &quot;!=&quot; ) membership } ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>membership     = range_expr { ( &quot;in&quot; | &quot;not&quot; &quot;in&quot; ) range_expr } ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>range_expr     = addition [ ( &quot;..&quot; | &quot;..=&quot; ) addition ] ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>addition       = multiplication { ( &quot;+&quot; | &quot;-&quot; ) multiplication } ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>multiplication = power { ( &quot;*&quot; | &quot;/&quot; | &quot;%&quot; ) power } ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>power          = unary [ &quot;**&quot; power ] ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>unary          = ( &quot;-&quot; | &quot;...&quot; ) unary | postfix ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>postfix        = primary { call | member | index | optional_chain } ;</span></span>
<span class="line"><span>call           = &quot;(&quot; [ argument_list ] &quot;)&quot; ;</span></span>
<span class="line"><span>member         = &quot;.&quot; IDENTIFIER ;</span></span>
<span class="line"><span>index          = &quot;[&quot; ( expression | slice ) &quot;]&quot; ;</span></span>
<span class="line"><span>slice          = [ expression ] &quot;:&quot; [ expression ] [ &quot;:&quot; [ expression ] ] ;</span></span>
<span class="line"><span>optional_chain = &quot;?.&quot; IDENTIFIER ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>argument_list  = argument { &quot;,&quot; argument } ;</span></span>
<span class="line"><span>argument       = [ IDENTIFIER &quot;:&quot; ] expression | &quot;...&quot; expression ;</span></span></code></pre></div><h3 id="primary-expressions" tabindex="-1">Primary Expressions <a class="header-anchor" href="#primary-expressions" aria-label="Permalink to &quot;Primary Expressions&quot;">​</a></h3><div class="language-ebnf vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ebnf</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>primary = NUMBER</span></span>
<span class="line"><span>        | STRING</span></span>
<span class="line"><span>        | STRING_TEMPLATE</span></span>
<span class="line"><span>        | &quot;true&quot; | &quot;false&quot; | &quot;nil&quot;</span></span>
<span class="line"><span>        | IDENTIFIER</span></span>
<span class="line"><span>        | &quot;(&quot; expression &quot;)&quot;</span></span>
<span class="line"><span>        | array_literal</span></span>
<span class="line"><span>        | object_literal</span></span>
<span class="line"><span>        | lambda_expression</span></span>
<span class="line"><span>        | match_expression</span></span>
<span class="line"><span>        | if_expression ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>array_literal = &quot;[&quot; [ array_elements ] &quot;]&quot; ;</span></span>
<span class="line"><span>array_elements = list_comprehension | expression_list ;</span></span>
<span class="line"><span>list_comprehension = expression &quot;for&quot; IDENTIFIER &quot;in&quot; expression [ &quot;if&quot; expression ] ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>object_literal = &quot;{&quot; [ object_entries ] &quot;}&quot; ;</span></span>
<span class="line"><span>object_entries = dict_comprehension | object_entry { &quot;,&quot; object_entry } ;</span></span>
<span class="line"><span>dict_comprehension = expression &quot;:&quot; expression &quot;for&quot; IDENTIFIER [ &quot;,&quot; IDENTIFIER ] &quot;in&quot; expression [ &quot;if&quot; expression ] ;</span></span>
<span class="line"><span>object_entry   = ( IDENTIFIER | STRING ) &quot;:&quot; expression</span></span>
<span class="line"><span>               | IDENTIFIER</span></span>
<span class="line"><span>               | &quot;...&quot; expression ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>lambda_expression = &quot;fn&quot; &quot;(&quot; [ param_list ] &quot;)&quot; ( block | expression )</span></span>
<span class="line"><span>                  | IDENTIFIER &quot;=&gt;&quot; ( block | expression ) ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>match_expression = &quot;match&quot; expression &quot;{&quot; { match_arm } &quot;}&quot; ;</span></span>
<span class="line"><span>match_arm        = pattern [ &quot;if&quot; expression ] &quot;=&gt;&quot; ( block | expression ) ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>if_expression = &quot;if&quot; expression block</span></span>
<span class="line"><span>                { &quot;elif&quot; expression block }</span></span>
<span class="line"><span>                &quot;else&quot; block ;</span></span></code></pre></div><h2 id="patterns" tabindex="-1">Patterns <a class="header-anchor" href="#patterns" aria-label="Permalink to &quot;Patterns&quot;">​</a></h2><div class="language-ebnf vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ebnf</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>pattern = literal_pattern</span></span>
<span class="line"><span>        | range_pattern</span></span>
<span class="line"><span>        | variant_pattern</span></span>
<span class="line"><span>        | array_pattern</span></span>
<span class="line"><span>        | string_concat_pattern</span></span>
<span class="line"><span>        | wildcard_pattern</span></span>
<span class="line"><span>        | binding_pattern ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>literal_pattern = NUMBER | STRING | &quot;true&quot; | &quot;false&quot; | &quot;nil&quot; ;</span></span>
<span class="line"><span>range_pattern   = NUMBER ( &quot;..&quot; | &quot;..=&quot; ) NUMBER ;</span></span>
<span class="line"><span>variant_pattern = IDENTIFIER &quot;(&quot; [ IDENTIFIER { &quot;,&quot; IDENTIFIER } ] &quot;)&quot; ;</span></span>
<span class="line"><span>array_pattern   = &quot;[&quot; [ IDENTIFIER { &quot;,&quot; IDENTIFIER } ] &quot;]&quot; ;</span></span>
<span class="line"><span>string_concat_pattern = STRING &quot;++&quot; IDENTIFIER ;</span></span>
<span class="line"><span>wildcard_pattern = &quot;_&quot; ;</span></span>
<span class="line"><span>binding_pattern  = IDENTIFIER ;</span></span></code></pre></div><h2 id="type-annotations" tabindex="-1">Type Annotations <a class="header-anchor" href="#type-annotations" aria-label="Permalink to &quot;Type Annotations&quot;">​</a></h2><div class="language-ebnf vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ebnf</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>type_annotation = simple_type</span></span>
<span class="line"><span>                | array_type ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>simple_type    = IDENTIFIER [ &quot;&lt;&quot; type_annotation { &quot;,&quot; type_annotation } &quot;&gt;&quot; ] ;</span></span>
<span class="line"><span>array_type     = &quot;[&quot; type_annotation &quot;]&quot; ;</span></span></code></pre></div><h2 id="destructuring-patterns" tabindex="-1">Destructuring Patterns <a class="header-anchor" href="#destructuring-patterns" aria-label="Permalink to &quot;Destructuring Patterns&quot;">​</a></h2><div class="language-ebnf vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ebnf</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>object_pattern = &quot;{&quot; object_pattern_entry { &quot;,&quot; object_pattern_entry } &quot;}&quot; ;</span></span>
<span class="line"><span>object_pattern_entry = IDENTIFIER [ &quot;:&quot; IDENTIFIER ] [ &quot;=&quot; expression ] ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>array_pattern  = &quot;[&quot; [ IDENTIFIER { &quot;,&quot; IDENTIFIER } [ &quot;,&quot; &quot;...&quot; IDENTIFIER ] ] &quot;]&quot; ;</span></span></code></pre></div><h2 id="jsx-grammar" tabindex="-1">JSX Grammar <a class="header-anchor" href="#jsx-grammar" aria-label="Permalink to &quot;JSX Grammar&quot;">​</a></h2><div class="language-ebnf vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ebnf</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>jsx_element = jsx_self_closing | jsx_open_close ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>jsx_self_closing = &quot;&lt;&quot; jsx_tag { jsx_attribute } &quot;/&gt;&quot; ;</span></span>
<span class="line"><span>jsx_open_close   = &quot;&lt;&quot; jsx_tag { jsx_attribute } &quot;&gt;&quot;</span></span>
<span class="line"><span>                   { jsx_child }</span></span>
<span class="line"><span>                   &quot;&lt;/&quot; jsx_tag &quot;&gt;&quot; ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>jsx_tag = IDENTIFIER ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>jsx_attribute = IDENTIFIER [ &quot;=&quot; ( &quot;{&quot; expression &quot;}&quot; | STRING ) ]</span></span>
<span class="line"><span>              | ( &quot;on:&quot; | &quot;bind:&quot; | &quot;class:&quot; | &quot;style:&quot; ) IDENTIFIER &quot;=&quot; &quot;{&quot; expression &quot;}&quot;</span></span>
<span class="line"><span>              | &quot;{&quot; &quot;...&quot; expression &quot;}&quot; ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>jsx_child = jsx_element</span></span>
<span class="line"><span>          | jsx_text</span></span>
<span class="line"><span>          | jsx_expression</span></span>
<span class="line"><span>          | jsx_if</span></span>
<span class="line"><span>          | jsx_for ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>jsx_text       = STRING | raw_text ;</span></span>
<span class="line"><span>raw_text       = { any character except &quot;&lt;&quot; | &quot;{&quot; | &#39;&quot;&#39; | &quot;&#39;&quot; } ;</span></span>
<span class="line"><span>jsx_expression = &quot;{&quot; expression &quot;}&quot; ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>jsx_if  = &quot;if&quot; expression &quot;{&quot; { jsx_child } &quot;}&quot;</span></span>
<span class="line"><span>          { &quot;elif&quot; expression &quot;{&quot; { jsx_child } &quot;}&quot; }</span></span>
<span class="line"><span>          [ &quot;else&quot; &quot;{&quot; { jsx_child } &quot;}&quot; ] ;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>jsx_for = &quot;for&quot; IDENTIFIER [ &quot;,&quot; IDENTIFIER ] &quot;in&quot; expression</span></span>
<span class="line"><span>          [ &quot;key&quot; &quot;=&quot; &quot;{&quot; expression &quot;}&quot; ]</span></span>
<span class="line"><span>          &quot;{&quot; { jsx_child } &quot;}&quot; ;</span></span></code></pre></div><h2 id="notes" tabindex="-1">Notes <a class="header-anchor" href="#notes" aria-label="Permalink to &quot;Notes&quot;">​</a></h2><ol><li><p><strong>Newline sensitivity</strong>: Newlines are significant in some contexts. A <code>[</code> on a new line is not treated as a subscript of the previous expression.</p></li><li><p><strong>Semicolons</strong>: Optional. Newlines serve as statement terminators. Semicolons can be used for multiple statements on one line.</p></li><li><p><strong>Implicit returns</strong>: The last expression in a function body is returned. Explicit <code>return</code> is also supported.</p></li><li><p><strong><code>elif</code> not <code>else if</code></strong>: Chained conditionals use the <code>elif</code> keyword, not <code>else if</code>.</p></li><li><p><strong>For loop variables</strong>: <code>for key, val in pairs {}</code> uses comma-separated identifiers, not array destructuring.</p></li><li><p><strong><code>Type.new()</code></strong>: <code>Type.new(args)</code> transpiles to <code>new Type(args)</code> in JavaScript for constructing built-in types.</p></li><li><p><strong>Unquoted JSX text</strong>: Text inside JSX elements can be unquoted (<code>&lt;h1&gt;Hello World&lt;/h1&gt;</code>) or quoted (<code>&lt;h1&gt;&quot;Hello World&quot;&lt;/h1&gt;</code>). Unquoted text is scanned as raw <code>JSX_TEXT</code> tokens by the lexer. The keywords <code>if</code>, <code>for</code>, <code>elif</code>, and <code>else</code> are reserved for JSX control flow and cannot appear as unquoted text.</p></li><li><p><strong>String pattern matching</strong>: The <code>++</code> operator in patterns matches a string prefix and binds the remainder to a variable: <code>&quot;api/&quot; ++ rest</code> matches any string starting with <code>&quot;api/&quot;</code> and binds the rest.</p></li></ol>`,40)])])}const _=s(e,[["render",p]]);export{d as __pageData,_ as default};
