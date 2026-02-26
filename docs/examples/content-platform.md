# Content Platform

This example builds an AI-enhanced content management platform. It combines the data layer with multiple AI providers to classify, extract metadata, generate summaries, and power a searchable dashboard. It demonstrates multi-model strategies, data pipeline enrichment, and refresh policies.

## The Full Application

```tova
shared {
  type Article {
    id: Int
    title: String
    body: String
    author: String
    published_at: String
    url: String
  }

  type Category { Tech, Business, Science, Health, Politics, Sports, Entertainment, Other }

  type Sentiment { Positive, Negative, Neutral, Mixed }

  type EnrichedArticle {
    id: Int
    title: String
    body: String
    author: String
    published_at: String
    url: String
    category: Category
    sentiment: Sentiment
    summary: String
    keywords: [String]
    reading_time_min: Int
  }

  type CategoryCount {
    category: String
    count: Int
  }

  type SentimentCount {
    sentiment: String
    count: Int
  }

  type ArticleAnalysis {
    summary: String
    key_points: [String]
    related_topics: [String]
  }

  type Insight {
    total_articles: Int
    by_category: [CategoryCount]
    by_sentiment: [SentimentCount]
    trending_keywords: [String]
  }
}

data {
  // Load raw articles from JSON API
  source raw_articles: Table<Article> = read("https://api.example.com/articles.json")

  // Cleaning pipeline
  pipeline articles = raw_articles
    |> drop_nil(.title)
    |> drop_nil(.body)
    |> derive(
      .title = .title |> trim(),
      .author = .author |> trim() |> unwrapOr("Unknown"),
      .body = .body |> trim()
    )
    |> where(.body |> len() > 100)
    |> drop_duplicates(.url)
    |> sort_by(.published_at, desc: true)

  // AI enrichment pipeline
  pipeline enriched = articles
    |> derive(
      .category = fast.classify(
        "Article title: {.title}\nFirst 200 chars: {.body |> take_chars(200)}",
        Category
      ),
      .sentiment = fast.classify(
        "Analyze sentiment of this article:\n{.title}\n{.body |> take_chars(300)}",
        Sentiment
      ),
      .summary = smart.ask(
        "Summarize in 2 sentences:\n\n{.title}\n\n{.body |> take_chars(1000)}"
      ),
      .keywords = smart.extract(
        .body |> take_chars(500),
        [String],
        prompt: "Extract 5 key topics as a list of short phrases"
      ),
      .reading_time_min = (.body |> len()) / 1200 + 1
    )

  // Aggregation pipelines
  pipeline by_category = enriched
    |> group_by(.category)
    |> agg(
      count: count(),
      avg_sentiment_score: count()
    )
    |> sort_by(.count, desc: true)

  pipeline by_sentiment = enriched
    |> group_by(.sentiment)
    |> agg(count: count())
    |> sort_by(.count, desc: true)

  validate Article {
    .title |> len() > 0,
    .body |> len() > 100,
    .url |> starts_with("http")
  }

  refresh raw_articles every 30.minutes
}

server {
  // Smart model for summaries and extraction
  ai "smart" {
    provider: "anthropic"
    model: "claude-sonnet"
    api_key: env("ANTHROPIC_API_KEY")
  }

  // Fast model for bulk classification
  ai "fast" {
    provider: "anthropic"
    model: "claude-haiku"
    api_key: env("ANTHROPIC_API_KEY")
  }

  // --- Article Endpoints ---

  fn get_articles(category: Option<String>, sentiment: Option<String>) -> [EnrichedArticle] {
    result = enriched

    result = match category {
      Some(cat) => result |> where(.category |> to_string() == cat)
      None => result
    }

    result = match sentiment {
      Some(s) => result |> where(.sentiment |> to_string() == s)
      None => result
    }

    result |> to_list()
  }

  fn get_article(id: Int) -> Result<EnrichedArticle, String> {
    enriched
      |> where(.id == id)
      |> first()
      |> ok_or("Article not found")
  }

  fn search_articles(query: String) -> [EnrichedArticle] {
    enriched
      |> where(
        .title |> lower() |> contains(query |> lower())
        or .summary |> lower() |> contains(query |> lower())
        or .keywords |> any(fn(k) k |> lower() |> contains(query |> lower()))
      )
      |> to_list()
  }

  // --- Insights ---

  fn get_insights() -> Insight {
    all_keywords = enriched
      |> select(.keywords)
      |> explode(.keywords)
      |> group_by(.keywords)
      |> agg(count: count())
      |> sort_by(.count, desc: true)
      |> limit(20)
      |> select(.keywords)
      |> to_list()

    Insight {
      total_articles: enriched |> count(),
      by_category: by_category |> to_list(),
      by_sentiment: by_sentiment |> to_list(),
      trending_keywords: all_keywords
    }
  }

  // --- Deep Analysis (on-demand, uses smart model) ---

  fn analyze_article(id: Int) {
    article = get_article(id)?

    analysis = smart.extract(
      article.body,
      ArticleAnalysis,
      prompt: "Provide a detailed analysis with a 3-sentence summary, 5 key points, and 3 related topics"
    )

    Ok(analysis)
  }

  // --- Routes ---

  route GET "/api/articles" => get_articles
  route GET "/api/articles/:id" => get_article
  route GET "/api/articles/search" => search_articles
  route GET "/api/articles/:id/analyze" => analyze_article
  route GET "/api/insights" => get_insights
}

browser {
  state articles: [EnrichedArticle] = []
  state insights: Option<Insight> = None
  state search = ""
  state category_filter: Option<String> = None
  state sentiment_filter: Option<String> = None
  state selected_article: Option<EnrichedArticle> = None
  state loading = true

  fn filter_articles() {
    result = articles

    result = match search |> len() > 0 {
      true => result |> filter(fn(a) {
        a.title |> lower() |> contains(search |> lower())
        or a.summary |> lower() |> contains(search |> lower())
      })
      false => result
    }

    result = match category_filter {
      Some(cat) => result |> filter(fn(a) a.category |> to_string() == cat)
      None => result
    }

    match sentiment_filter {
      Some(s) => result |> filter(fn(a) a.sentiment |> to_string() == s)
      None => result
    }
  }

  computed filtered = filter_articles()

  computed category_counts = articles
    |> group_by(fn(a) a.category |> to_string())
    |> entries()
    |> map(fn(pair) ({ category: pair[0], count: pair[1] |> len() }))
    |> sorted(fn(a, b) b.count - a.count)

  effect {
    articles = server.get_articles(None, None)
    insights = Some(server.get_insights())
    loading = false
  }

  computed insight_data = match insights {
    Some(d) => d
    None => nil
  }

  component InsightPanel {
    <div>
      if insights != None {
        <div class="insights">
          <div class="stat">
            <span class="label">"Articles"</span>
            <span class="value">{insight_data.total_articles}</span>
          </div>

          <div class="categories">
            <h3>"By Category"</h3>
            for item in insight_data.by_category {
              <div class="bar" onclick={fn() {
                category_filter = Some(item.category)
              }}>
                <span>{item.category}</span>
                <span>{item.count}</span>
              </div>
            }
          </div>

          <div class="sentiments">
            <h3>"By Sentiment"</h3>
            for item in insight_data.by_sentiment {
              <div class="bar" onclick={fn() {
                sentiment_filter = Some(item.sentiment)
              }}>
                <span>{item.sentiment}</span>
                <span>{item.count}</span>
              </div>
            }
          </div>

          <div class="trending">
            <h3>"Trending Topics"</h3>
            <div class="tags">
              for keyword in insight_data.trending_keywords {
                <span class="tag" onclick={fn() { search = keyword }}>{keyword}</span>
              }
            </div>
          </div>
        </div>
      } else {
        <p>"Loading insights..."</p>
      }
    </div>
  }

  component Filters {
    <div class="filters">
      <input
        type="text"
        bind:value={search}
        placeholder="Search articles..."
      />
      <div class="active-filters">
        if category_filter != None {
          <span class="filter-tag">
            {category_filter |> unwrap()}
            <button onclick={fn() { category_filter = None }}>"x"</button>
          </span>
        }
        if sentiment_filter != None {
          <span class="filter-tag">
            {sentiment_filter |> unwrap()}
            <button onclick={fn() { sentiment_filter = None }}>"x"</button>
          </span>
        }
      </div>
    </div>
  }

  component ArticleCard(article: EnrichedArticle) {
    <div class="article-card" onclick={fn() { selected_article = Some(article) }}>
      <div class="meta">
        <span class="category">{article.category |> to_string()}</span>
        <span class="sentiment">{article.sentiment |> to_string()}</span>
        <span class="time">"{article.reading_time_min} min read"</span>
      </div>
      <h3>{article.title}</h3>
      <p class="summary">{article.summary}</p>
      <div class="keywords">
        for kw in article.keywords {
          <span class="keyword">{kw}</span>
        }
      </div>
      <div class="footer">
        <span>{article.author}</span>
        <span>{article.published_at}</span>
      </div>
    </div>
  }

  computed current_article = match selected_article {
    Some(a) => a
    None => nil
  }

  component ArticleDetail {
    <div>
      if selected_article != None {
        <div class="article-detail">
          <button onclick={fn() { selected_article = None }}>"Back"</button>
          <h1>{current_article.title}</h1>
          <div class="meta">
            <span>{current_article.author}</span>
            <span>{current_article.published_at}</span>
            <span class="category">{current_article.category |> to_string()}</span>
            <span class="sentiment">{current_article.sentiment |> to_string()}</span>
          </div>
          <div class="summary-box">
            <h3>"AI Summary"</h3>
            <p>{current_article.summary}</p>
          </div>
          <div class="body">{current_article.body}</div>
        </div>
      } else {
        <p>"Select an article to view."</p>
      }
    </div>
  }

  component App {
    <div class="platform">
      <header>
        <h1>"Content Platform"</h1>
      </header>

      <div class="layout">
        <aside>
          <InsightPanel />
        </aside>

        <main>
          if selected_article != None {
            <ArticleDetail />
          } else {
            <div>
              <Filters />
              <div class="articles">
                for article in filtered {
                  <ArticleCard article={article} />
                }
                if filtered |> len() == 0 {
                  <p class="empty">"No articles match your filters."</p>
                }
              </div>
            </div>
          }
        </main>
      </div>
    </div>
  }
}
```

## Running It

```bash
ANTHROPIC_API_KEY=your-key tova dev platform.tova
```

## What This Demonstrates

### Data Block with AI Enrichment

The data block layers raw → clean → enriched pipelines:

```tova
source raw_articles = read("https://api.example.com/articles.json")

pipeline articles = raw_articles
  |> drop_nil(.title)
  |> derive(.author = .author |> trim() |> unwrapOr("Unknown"))
  |> where(.body |> len() > 100)

pipeline enriched = articles
  |> derive(
    .category = fast.classify(..., Category),
    .sentiment = fast.classify(..., Sentiment),
    .summary = smart.ask("Summarize: {.body |> take_chars(1000)}"),
    .keywords = smart.extract(.body, [String], prompt: "Extract 5 key topics")
  )
```

Each pipeline is a named transform chain. The enrichment pipeline adds AI-derived columns to each row using `derive()`.

### Multi-Model Strategy

```tova
ai "smart" { provider: "anthropic", model: "claude-sonnet", ... }
ai "fast"  { provider: "anthropic", model: "claude-haiku", ... }
```

- **fast (Haiku):** Used for bulk classification (`classify()`) — runs on every row in the enrichment pipeline. Cheap and fast.
- **smart (Sonnet):** Used for summaries (`ask()`) and structured extraction (`extract()`). Better quality for complex text analysis. Also used for on-demand deep analysis.

### Refresh Policy

```tova
refresh raw_articles every 30.minutes
```

The source data is re-fetched every 30 minutes. When the source refreshes, all dependent pipelines (`articles` → `enriched` → `by_category`) automatically re-evaluate.

### Classification with ADTs

```tova
type Category { Tech, Business, Science, Health, Politics, Sports, Entertainment, Other }

.category = fast.classify("Article: {.title}", Category)
```

`classify()` maps text to ADT variants. The AI sees the variant names and selects the best match. Using ADTs means pattern matching on the result is exhaustive.

### Aggregation Pipelines

```tova
pipeline by_category = enriched
  |> group_by(.category)
  |> agg(count: count())
  |> sort_by(.count, desc: true)
```

Aggregation pipelines turn enriched data into summary statistics. Server functions and client components reference these pipelines by name.

### Search Across Multiple Fields

```tova
fn search_articles(query: String) -> [EnrichedArticle] {
  enriched
    |> where(
      .title |> lower() |> contains(query |> lower())
      or .summary |> lower() |> contains(query |> lower())
      or .keywords |> any(fn(k) k |> lower() |> contains(query |> lower()))
    )
}
```

The `where` clause supports complex boolean expressions with `or` for matching across title, AI-generated summary, and extracted keywords.

### Client Dashboard

The client renders an insight panel, filter bar, and article list. Clicking a category in the insights panel sets a filter. Clicking a trending keyword populates the search. Clicking an article opens a detail view with the AI summary.

## Key Patterns

**Pipeline layering.** Raw → clean → enriched. Each layer has a single responsibility. Server functions reference the layer they need.

**Fast for bulk, smart for depth.** Classify and categorize with the cheap model. Summarize and extract with the capable model. Use the smart model on-demand for deep analysis.

**Refresh for freshness.** `refresh every 30.minutes` keeps data current without manual polling. Dependent pipelines cascade automatically.

**ADTs for classification categories.** Define categories as ADT variants. The compiler ensures you handle every category in pattern matches.

**Data-driven UI.** The insight panel, filter chips, and article cards all derive from the same enriched pipeline. The client filters locally for instant interaction.
