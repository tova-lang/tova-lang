# E-Commerce Store

This example builds a full e-commerce application with product browsing, a shopping cart, checkout, and order history. It demonstrates client stores for state management, server-side inventory guards, payment validation, and reactive computed values for cart totals and product filtering.

## The Full Application

```tova
shared {
  type Product {
    id: Int
    name: String
    description: String
    price: Float
    category: String
    image: String
    stock: Int
  }

  type CartItem {
    product: Product
    quantity: Int
  }

  type Order {
    id: Int
    items: [CartItem]
    total: Float
    status: OrderStatus
    created_at: String
  }

  type OrderStatus {
    Pending
    Processing
    Shipped(tracking: String)
    Delivered
    Cancelled(reason: String)
  }

  type Address {
    street: String
    city: String
    region: String
    zip: String
  }

  fn format_price(amount: Float) -> String {
    "${amount |> round(2)}"
  }
}

server {
  env STRIPE_KEY: String

  cors {
    origins: ["http://localhost:5173"],
    credentials: true
  }

  rate_limit {
    requests: 60,
    window: 1.minute
  }

  session {
    secret: env("SESSION_SECRET"),
    max_age: 30.days
  }

  upload {
    max_size: 5.megabytes,
    allowed_types: ["image/png", "image/jpeg", "image/webp"]
  }

  compression { enabled: true }

  db {
    adapter: "sqlite"
    database: "store.db"
  }

  model Product {
    name: String
    description: String
    price: Float
    category: String
    image: String
    stock: Int
  }

  model Order {
    user_id: Int
    items: String
    total: Float
    status: String
    shipping_address: String
  }

  // --- Product Endpoints ---

  fn get_products() -> [Product] {
    Product.all() |> sort_by(.name)
  }

  fn get_product(id: Int) -> Result<Product, String> {
    Product.find(id) |> ok_or("Product not found")
  }

  fn search_products(query: String, category: Option<String>) -> [Product] {
    results = Product.all()
      |> filter(fn(p) p.name |> lower() |> contains(query |> lower()))

    match category {
      Some(cat) => results |> filter(fn(p) p.category == cat)
      None => results
    }
  }

  fn get_categories() -> [String] {
    Product.all()
      |> map(fn(p) p.category)
      |> unique()
      |> sorted()
  }

  // --- Order Endpoints ---

  fn place_order(items: [CartItem], address: Address) -> Result<Order, String> {
    // Validate stock
    for item in items {
      product = Product.find(item.product.id) |> ok_or("Product not found")?
      guard product.stock >= item.quantity else {
        return Err("Insufficient stock for {product.name}")
      }
    }

    // Calculate total
    total = items
      |> map(fn(item) item.product.price * item.quantity)
      |> sum()

    guard total > 0.0 else {
      return Err("Order total must be positive")
    }

    // Deduct stock
    for item in items {
      Product.update(item.product.id, {
        stock: item.product.stock - item.quantity
      })
    }

    // Create order
    order = Order.create({
      user_id: 1,
      items: JSON.stringify(items),
      total: total,
      status: "Pending",
      shipping_address: JSON.stringify(address)
    })

    Ok(order)
  }

  fn get_orders() -> [Order] {
    Order.all() |> sort_by(.created_at, desc: true)
  }

  fn get_order(id: Int) -> Result<Order, String> {
    Order.find(id) |> ok_or("Order not found")
  }

  // --- Routes ---

  route GET "/api/products" => get_products
  route GET "/api/products/:id" => get_product
  route GET "/api/products/search" => search_products
  route GET "/api/categories" => get_categories
  route POST "/api/orders" => place_order
  route GET "/api/orders" => get_orders
  route GET "/api/orders/:id" => get_order
}

browser {
  // --- Stores ---

  store CartStore {
    state items: [CartItem] = []

    computed count = items
      |> map(fn(item) item.quantity)
      |> sum()

    computed total = items
      |> map(fn(item) item.product.price * item.quantity)
      |> sum()

    computed empty = items |> len() == 0

    fn add(product: Product) {
      existing = items |> find_by(fn(i) i.product.id == product.id)
      match existing {
        Some(item) => {
          items = items |> map(fn(i) {
            match i.product.id == product.id {
              true => {
                { product: i.product, quantity: i.quantity + 1 }
              }
              false => i
            }
          })
        }
        None => {
          items = [...items, { product: product, quantity: 1 }]
        }
      }
    }

    fn remove(product_id: Int) {
      items = items |> filter(fn(i) i.product.id != product_id)
    }

    fn update_quantity(product_id: Int, quantity: Int) {
      match quantity {
        0 => remove(product_id)
        q if q > 0 => {
          items = items |> map(fn(i) {
            match i.product.id == product_id {
              true => {
                { product: i.product, quantity: q }
              }
              false => i
            }
          })
        }
        _ => {}
      }
    }

    fn clear() {
      items = []
    }
  }

  store UIStore {
    state view = "products"
    state search = ""
    state category_filter: Option<String> = None
    state cart_open = false
    state order_confirmation: Option<Order> = None

    fn navigate(new_view: String) {
      view = new_view
      cart_open = false
      order_confirmation = None
    }

    fn toggle_cart() {
      cart_open = not cart_open
    }
  }

  // --- State ---

  state products: [Product] = []
  state categories: [String] = []
  state orders: [Order] = []
  state loading = true
  state error: Option<String> = None

  computed filtered_products = products
    |> filter(fn(p) {
      match UIStore.search |> len() > 0 {
        true => p.name |> lower() |> contains(UIStore.search |> lower())
        false => true
      }
    })
    |> filter(fn(p) {
      match UIStore.category_filter {
        Some(cat) => p.category == cat
        None => true
      }
    })

  effect {
    products = server.get_products()
    categories = server.get_categories()
    loading = false
  }

  // --- Checkout ---

  fn checkout(address: Address) {
    loading = true
    match server.place_order(CartStore.items, address) {
      Ok(order) => {
        CartStore.clear()
        UIStore.order_confirmation = Some(order)
        UIStore.navigate("confirmation")
        loading = false
      }
      Err(msg) => {
        error = Some(msg)
        loading = false
      }
    }
  }

  // --- Components ---

  component NavBar {
    <nav class="navbar">
      <div class="logo" onclick={fn() UIStore.navigate("products")}>
        "ShopTova"
      </div>
      <div class="nav-links">
        <button onclick={fn() UIStore.navigate("products")}>"Products"</button>
        <button onclick={fn() UIStore.navigate("orders")}>"Orders"</button>
        <button class="cart-btn" onclick={fn() UIStore.toggle_cart()}>
          "Cart ({CartStore.count})"
        </button>
      </div>
    </nav>
  }

  component SearchBar {
    <div class="search-bar">
      <input
        type="text"
        bind:value={UIStore.search}
        placeholder="Search products..."
      />
      <select onchange={fn(e) {
        UIStore.category_filter = match e.target.value {
          "" => None
          val => Some(val)
        }
      }}>
        <option value="">"All Categories"</option>
        for cat in categories {
          <option value={cat}>{cat}</option>
        }
      </select>
    </div>
  }

  component ProductCard(product: Product) {
    <div class="product-card">
      <img src={product.image} alt={product.name} />
      <h3>{product.name}</h3>
      <p class="category">{product.category}</p>
      <p class="price">{format_price(product.price)}</p>
      <p class="stock">
        {match product.stock {
          0 => "Out of stock"
          n if n < 5 => "Only {n} left!"
          _ => "In stock"
        }}
      </p>
      <button
        onclick={fn() CartStore.add(product)}
        disabled={product.stock == 0}
      >
        {match product.stock {
          0 => "Sold Out"
          _ => "Add to Cart"
        }}
      </button>
    </div>
  }

  component ProductGrid {
    <div class="product-grid">
      <SearchBar />
      <div class="grid">
        for product in filtered_products {
          <ProductCard product={product} />
        }
      </div>
      if filtered_products |> len() == 0 {
        <p class="no-results">"No products match your search."</p>
      }
    </div>
  }

  component CartDrawer {
    <div class="cart-overlay">
      if UIStore.cart_open {
        <div class="cart-drawer">
          <div class="cart-header">
            <h2>"Shopping Cart"</h2>
            <button onclick={fn() UIStore.toggle_cart()}>"x"</button>
          </div>

          if CartStore.empty {
            <p>"Your cart is empty"</p>
          } else {
            <div class="cart-items">
              for item in CartStore.items {
                <div class="cart-item">
                  <span class="name">{item.product.name}</span>
                  <div class="quantity">
                    <button onclick={fn() CartStore.update_quantity(item.product.id, item.quantity - 1)}>"-"</button>
                    <span>{item.quantity}</span>
                    <button onclick={fn() CartStore.update_quantity(item.product.id, item.quantity + 1)}>"+"</button>
                  </div>
                  <span class="price">{format_price(item.product.price * item.quantity)}</span>
                  <button onclick={fn() CartStore.remove(item.product.id)}>"Remove"</button>
                </div>
              }
            </div>
            <div class="cart-footer">
              <div class="total">"Total: {format_price(CartStore.total)}"</div>
              <button onclick={fn() {
                UIStore.toggle_cart()
                UIStore.navigate("checkout")
              }}>"Checkout"</button>
              <button onclick={fn() CartStore.clear()}>"Clear Cart"</button>
            </div>
          }
        </div>
      }
    </div>
  }

  component CheckoutForm {
    state street = ""
    state city = ""
    state zip_code = ""
    state addr_region = ""

    fn submit_order() {
      address = {
        street: street,
        city: city,
        region: addr_region,
        zip: zip_code
      }
      checkout(address)
    }

    <div class="checkout">
      <h2>"Checkout"</h2>

      <div class="order-summary">
        <h3>"Order Summary"</h3>
        for item in CartStore.items {
          <div class="summary-item">
            <span>"{item.product.name} x {item.quantity}"</span>
            <span>{format_price(item.product.price * item.quantity)}</span>
          </div>
        }
        <div class="summary-total">
          <strong>"Total: {format_price(CartStore.total)}"</strong>
        </div>
      </div>

      <form onsubmit={fn(e) { e.preventDefault()
        submit_order() }}>
        <h3>"Shipping Address"</h3>
        <input type="text" bind:value={street} placeholder="Street" required />
        <input type="text" bind:value={city} placeholder="City" required />
        <input type="text" bind:value={addr_region} placeholder="State" required />
        <input type="text" bind:value={zip_code} placeholder="ZIP" required />

        <button type="submit" disabled={CartStore.empty or loading}>
          {match loading { true => "Placing Order..." false => "Place Order" }}
        </button>
      </form>

      if error != None {
        <div class="error">{error |> unwrap()}</div>
      }
    </div>
  }

  component OrderHistory {
    state loaded_orders: [Order] = []

    effect {
      loaded_orders = server.get_orders()
    }

    <div class="order-history">
      <h2>"Order History"</h2>
      if loaded_orders |> len() == 0 {
        <p>"No orders yet."</p>
      } else {
        <div class="orders">
          for order in loaded_orders {
            <div class="order-card">
              <div class="order-header">
                <span>"Order {order.id}"</span>
                <span class="status">
                  {match order.status {
                    Pending => "Pending"
                    Processing => "Processing"
                    Shipped(tracking) => "Shipped ({tracking})"
                    Delivered => "Delivered"
                    Cancelled(reason) => "Cancelled: {reason}"
                  }}
                </span>
              </div>
              <div class="order-total">{format_price(order.total)}</div>
              <div class="order-date">{order.created_at}</div>
            </div>
          }
        </div>
      }
    </div>
  }

  component OrderConfirmation {
    <div class="order-confirmation">
      if UIStore.order_confirmation != None {
        <div class="confirmation">
          <h2>"Order Confirmed!"</h2>
          <p>"Your order has been placed."</p>
          <p>"Total: {format_price(UIStore.order_confirmation |> unwrap() |> .total)}"</p>
          <button onclick={fn() UIStore.navigate("products")}>"Continue Shopping"</button>
          <button onclick={fn() UIStore.navigate("orders")}>"View Orders"</button>
        </div>
      } else {
        <p>"No order to display."</p>
      }
    </div>
  }

  component App {
    <div class="store">
      <NavBar />
      <CartDrawer />

      <main>
        if UIStore.view == "products" {
          <ProductGrid />
        } elif UIStore.view == "checkout" {
          <CheckoutForm />
        } elif UIStore.view == "orders" {
          <OrderHistory />
        } elif UIStore.view == "confirmation" {
          <OrderConfirmation />
        } else {
          <ProductGrid />
        }
      </main>
    </div>
  }
}
```

## Running It

```bash
SESSION_SECRET="your-secret" tova dev store.tova
```

## What This Demonstrates

### Client Stores

Stores encapsulate related state, computed values, and functions:

```tova
store CartStore {
  state items: [CartItem] = []
  computed count = items |> map(fn(item) item.quantity) |> sum()
  computed total = items |> map(fn(item) item.product.price * item.quantity) |> sum()
  fn add(product: Product) { ... }
  fn remove(product_id: Int) { ... }
  fn clear() { items = [] }
}
```

Access store values with dot notation: `CartStore.items`, `CartStore.total`, `CartStore.add(product)`. Stores are reactive — when `items` changes, `count` and `total` recompute automatically.

### Multiple Stores

`CartStore` manages shopping cart state. `UIStore` manages navigation and UI state. Each store is independent but can be used together in components:

```tova
<button onclick={fn() {
  UIStore.toggle_cart()
  UIStore.navigate("checkout")
}}>
  "Checkout ({CartStore.count} items)"
</button>
```

### Inventory Guards

The server validates stock before processing orders:

```tova
for item in items {
  product = Product.find(item.product.id) |> ok_or("Product not found")?
  guard product.stock >= item.quantity else {
    return Err("Insufficient stock for {product.name}")
  }
}
```

Guard clauses with `?` propagation ensure each product exists and has sufficient stock before any inventory is deducted.

### Reactive Computed Filtering

```tova
computed filtered_products = products
  |> filter(fn(p) {
    match UIStore.search |> len() > 0 {
      true => p.name |> lower() |> contains(UIStore.search |> lower())
      false => true
    }
  })
  |> filter(fn(p) {
    match UIStore.category_filter {
      Some(cat) => p.category == cat
      None => true
    }
  })
```

The computed value chains two filter pipes. It re-evaluates whenever `products`, `UIStore.search`, or `UIStore.category_filter` changes.

### Client-Side Routing with If/Elif

```tova
if UIStore.view == "products" {
  <ProductGrid />
} elif UIStore.view == "checkout" {
  <CheckoutForm />
} elif UIStore.view == "orders" {
  <OrderHistory />
} elif UIStore.view == "confirmation" {
  <OrderConfirmation />
} else {
  <ProductGrid />
}
```

Simple string-based routing using `if`/`elif` on a store value. `UIStore.navigate()` updates the view string and resets UI state.

### OrderStatus ADT in JSX

```tova
{match order.status {
  Pending => "Pending"
  Shipped(tracking) => "Shipped ({tracking})"
  Cancelled(reason) => "Cancelled: {reason}"
  ...
}}
```

ADT variants are destructured directly in JSX `match` expressions, extracting data like tracking numbers and cancellation reasons.

## Key Patterns

**Stores for domain state.** Use a store when you have related state, computed values, and mutations that belong together. `CartStore` is a natural unit.

**Shared types for the contract.** `Product`, `CartItem`, `OrderStatus` in `shared {}` are used by both server validation and client rendering.

**Guard clauses for business logic.** Stock validation and order total checks use guards for readable, linear validation chains.

**Conditional routing.** For simple apps, `if`/`elif` on a view state string is simpler than a full routing library. Each branch renders a different component.
