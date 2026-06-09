---
title: Building a REST API with Java, Spring Boot, and PostgreSQL
date: 2026-06-08
duration: a little long
---

This post is for anyone who wants to learn how to build and use REST APIs in Spring Boot. To follow along, you should have a basic understanding of REST APIs, Java, the Spring Framework, and PostgreSQL. By the end of this guide, you will have a solid grasp of how REST APIs are implemented in a Spring Boot project.

Before diving in, I feel the need to justify writing about building REST APIs—and learning the fundamentals in general in the era of AI. Today, in June 2026, almost anyone can one-shot this API using any of the major LLMs. So, why bother?

There is no denying that AI has already transformed how we work. Repetitive tasks can now be automated, and domain-specific knowledge is accessible to anyone. Consequently, simply holding information is no longer the competitive edge it once was, and certain jobs can now be done by fewer people. The rapid increase in AI capabilities is undeniable; the difference between three years ago and today is tremendous. Add in current market conditions, and it is undoubtedly a tough time for developers.

With that being said, I take a more optimistic stance on the AI discussion. My reasoning stems from the fact that AI, at its core, cannot do math. If it can't do math, it cannot truly reason and without reasoning, you cannot do engineering. To me, AI will remain a highly useful tool rather than a replacement. Furthermore, developers are currently the best customers for AI companies. Do they really want to eliminate their primary user base? At least for now, the answer is no. As for the future, who knows?

I believe it is better to focus on the advantages these tools offer us. And to properly leverage those advantages, it all starts with mastering the fundamentals, right?

I am writing this post primarily as notes for myself. But to my fellow readers, feel free to stick around and try it out for yourself.

This API focuses on registering tenants and accessing their ledgers. For simplicity, I will build two endpoints from scratch:
POST /api/v1/tenants
GET /api/v1/ledger/{tenantId}/entries/{entryId}

---

## The Big Picture

Every HTTP request passes through these layers in order:

```
HTTP Request (JSON)
    │
    ▼
Controller      → deserializes JSON into DTO, calls service
    │
    ▼
Service         → business logic, calls mapper + repository
    │
    ▼
Repository      → database queries
    │
    ▼
PostgreSQL      → the actual data
    │
    ▼
Repository      → returns saved Domain object (with id, timestamps)
    │
    │  Tenant (Domain)
    ▼
Service         → calls mapper to convert Domain → DTO
    │
    ▼
Controller      → returns DTO, serialized to JSON
    │
    ▼
HTTP Response (JSON)
```

The Controller is the entry point, it receives the HTTP request and delegates to the Service. The Service handles the business logic and calls the Repository when it needs data. The Repository talks to the database.

DTOs (Data Transfer Objects) are custom Java objects that carry data in and out of the API. They're different from Domain objects, the Mapper translates between the two. This separation means you control exactly what gets exposed to the outside world, regardless of what's in your database.

---

## Setting Up the Environment

This project was built on Ubuntu. If you're on Windows, WSL works fine. Some Docker and terminal commands may differ slightly depending on your OS, but the Java and Spring Boot code is identical everywhere.

### What's running

We need PostgreSQL running before we start the app. The cleanest way is Docker — no installation, no version conflicts, and you can throw it away when you're done.

Run a PostgreSQL container:

```bash
docker run -d \
  --name learning-postgres \
  -e POSTGRES_USER=myuser \
  -e POSTGRES_PASSWORD=mypassword \
  -e POSTGRES_DB=learning_api \
  -p 127.0.0.1:5432:5432 \
  postgres:16-alpine
```

What each flag does:

| Flag                       | What it does                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `-d`                       | Run in the background (detached)                                                                        |
| `--name learning-postgres` | Give the container a name so you can reference it later                                                 |
| `-e POSTGRES_USER`         | The database user Spring will connect as                                                                |
| `-e POSTGRES_PASSWORD`     | The password for that user                                                                              |
| `-e POSTGRES_DB`           | Creates this database automatically on first start                                                      |
| `-p 127.0.0.1:5432:5432`   | Forward port 5432 on your machine into the container — without this, nothing outside Docker can connect |
| `postgres:16-alpine`       | The image to use. `alpine` is a minimal Linux base — smaller image, same PostgreSQL                     |

Be careful with port forwarding, we dont want to expose the ports to outworld acccess by doing 5432:5432. 127.0.0.1 means localhost. 127.0.0.1:5432:5432, so the docker port can only be accessed from the localhost.

Verify it's running:

```bash
docker ps
```

You'll see:

```
CONTAINER ID   IMAGE                PORTS                    NAMES
a1b2c3d4e5f6   postgres:16-alpine   127.0.0.1:5432->5432/tcp   learning-postgres
```

The `->` arrow means port forwarding is active. Your app can now reach PostgreSQL at `localhost:5432`.

Connect and check what's inside:

```bash
docker exec -it learning-postgres psql -U myuser -d learning_api
```

Once inside the `psql` shell:

```sql
\l        -- list all databases
\dt       -- list all tables (after the app runs migrations)
\q        -- quit
```

The values you set with `-e` flags must match `application.yaml` exactly:

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/learning_api
    username: myuser
    password: mypassword
```

If these don't match, the app will fail to start with a connection error.

---

## Project Setup: Spring Initializr

Go to [start.spring.io](https://start.spring.io) and configure:

| Setting     | Value          | Why                                                     |
| ----------- | -------------- | ------------------------------------------------------- |
| Project     | Maven          | Most tutorials use it; `pom.xml` is verbose but obvious |
| Language    | Java           | —                                                       |
| Spring Boot | 3.4.5          | Latest stable                                           |
| Group       | `com.learn`    | —                                                       |
| Artifact    | `learning-api` | —                                                       |
| Packaging   | Jar            | —                                                       |
| Java        | 21             | Supported for years, production-safe                    |

Download and unzip it to a folder.

**Why Maven and not Gradle?** Both do the same job. Maven's `pom.xml` is more verbose but completely explicit — easier to read when learning. Gradle is more concise but has more magic. Learn concepts first, syntax second.

**Why Java 21?** Java 21 is an LTS (Long Term Support) release — it receives security and bug fixes for years. Java 26 is a short-term release replaced every 6 months. For anything you want to be stable, always pick LTS. Current LTS versions: 8, 11, 17, **21**, next is 25.

### Dependencies to add

| Dependency          | What it does                                                             |
| ------------------- | ------------------------------------------------------------------------ |
| `Spring Web`        | Lets you write `@RestController` and handle HTTP requests                |
| `Spring Data JPA`   | `JpaRepository` — `save()`, `findById()` etc. for free                   |
| `PostgreSQL Driver` | JDBC driver so Java can talk to PostgreSQL                               |
| `Validation`        | `@NotBlank`, `@Email` — automatic input validation before your code runs |
| `Flyway Migration`  | Runs SQL migration files on startup to keep the DB schema in sync        |

### The database stack explained

There are 3 layers stacked on top of each other:

```
Your code
    ↓
Spring Data JPA   ← you work here (JpaRepository)
    ↓
Hibernate         ← generates SQL from your Java objects
    ↓
JDBC              ← sends SQL to the database
    ↓
PostgreSQL
```

- **JDBC** — raw Java standard for database connections. Works but painful to use directly.
- **Hibernate** — ORM (Object Relational Mapper). You write Java objects, it generates the SQL.
- **JPA** — a specification (a set of rules) that Hibernate implements. Defines `@Entity`, `@Column`, `@Id` etc.
- **Spring Data JPA** — sits on top of Hibernate, gives you `JpaRepository` so you don't even write Hibernate code.

### What Validation does

Without it you'd write this for every field:

```java
if (request.email() == null || request.email().isBlank()) {
    throw new IllegalArgumentException("email is required");
}
```

With it:

```java
public record CreateTenantRequest(
    @NotBlank String name,
    @NotBlank @Email String email
) {}
```

---

## application.yaml — Connecting Spring to PostgreSQL

```yaml
spring:
  application:
    name: learning-api
  datasource:
    url: jdbc:postgresql://localhost:5432/learning_api
    username: myuser
    password: mypassword
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: true
  flyway:
    enabled: true

server:
  port: 8081
```

**YAML indentation is important.** It defines the hierarchy. `datasource`, `jpa`, and `flyway` must be siblings of `application` under `spring` — 2 spaces in, not 4.

### What each block does

**`datasource`** — tells Spring how to connect to the database.
The URL format is always: `jdbc:<driver>://<host>:<port>/<database>`

**`jpa.hibernate.ddl-auto: validate`** — on startup, Hibernate checks that the database schema matches your Java classes. It does NOT create or modify tables — that's Flyway's job. Options are:

- `validate` — check only (use this in production and learning)
- `create` — drop and recreate tables every restart (dangerous, destroys data)
- `update` — try to alter tables to match (dangerous in production)

**`jpa.show-sql: true`** — prints every SQL query Hibernate generates to the console. Very useful while learning to see what's actually happening.

**`flyway.enabled: true`** — on startup, Flyway scans `src/main/resources/db/migration/` and runs any SQL files it hasn't run before. This keeps your schema in sync automatically.

### Why Flyway instead of letting Hibernate create the tables?

Hibernate's `ddl-auto: create` would work for local dev but it **drops everything on restart**. Flyway runs each migration file exactly once and tracks which ones it has run. In production, you never lose data — you only ever add new migration files.

---

## The Database Schema (Flyway Migration)

**File:** `src/main/resources/db/migration/V1__init_schema.sql`

The filename format is strict: `V` + version number + `__` (two underscores) + description + `.sql`. Flyway runs each file exactly once and tracks which ones it has already run.

```sql
CREATE TABLE tenants (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(255) NOT NULL,
    email      VARCHAR(255) NOT NULL UNIQUE,
    status     VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID         NOT NULL REFERENCES tenants(id),
    type         VARCHAR(20)  NOT NULL,
    amount_cents BIGINT       NOT NULL,
    description  VARCHAR(500),
    reference_id UUID,
    created_at   TIMESTAMP    NOT NULL DEFAULT now()
);
```

### Design decisions explained

| Decision                       | Why                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `UUID` as primary key          | Can't be guessed sequentially. Can be generated anywhere — not just in the DB.                                     |
| `DEFAULT gen_random_uuid()`    | DB generates the ID automatically on every INSERT. You never set it manually.                                      |
| `VARCHAR(255)` not `TEXT`      | Forces you to think about limits. Both perform the same in PostgreSQL.                                             |
| `NOT NULL` on required fields  | DB enforces this — even if your app has a bug, the DB won't allow nulls.                                           |
| `email UNIQUE`                 | DB enforces no duplicates — even if your app code misses it.                                                       |
| `status VARCHAR` not `boolean` | A boolean can only be two things. A string supports future states: `SUSPENDED`, `PENDING`, `DELETED`.              |
| `REFERENCES tenants(id)`       | Foreign key — a ledger entry cannot exist without a valid tenant. DB rejects invalid inserts.                      |
| No `updated_at` on ledger      | Ledger entries are immutable. Financial records must never be edited. No column = physically impossible to update. |
| `amount_cents BIGINT`          | Money is stored as integer cents. `$12.50` = `1250`. Floats have rounding errors — never use them for money.       |
| `description` nullable         | Optional field — a ledger entry doesn't require a description.                                                     |

---

## Building the POST Endpoint — Tenant

### The Domain Layer — Tenant.java

**File:** `src/main/java/com/learn/learning_api/domain/Tenant.java`

The Domain class is a Java object that mirrors a database row. Every field maps to a column.

```java
@Entity
@Table(name = "tenants")
@EntityListeners(AuditingEntityListener.class)
public class Tenant {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String status = "ACTIVE";

    @CreatedDate
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(nullable = false)
    private LocalDateTime updatedAt;
}
```

#### What the annotations mean

**Class-level annotations:**

| Annotation                                       | What it does                                                                                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@Entity`                                        | Tells Hibernate this class represents a database table. Without this, Hibernate ignores the class.                                                                |
| `@Table(name = "tenants")`                       | Tells Hibernate which table to map to. Without this, Hibernate looks for a table named after the class (`tenant`). Our table is `tenants` so we must be explicit. |
| `@EntityListeners(AuditingEntityListener.class)` | Hooks into Hibernate's save/update events so `@CreatedDate` and `@LastModifiedDate` work. Without this line, those two annotations do nothing.                    |

**Field-level annotations:**

| Annotation                                        | What it does                                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `@Id`                                             | Marks this field as the primary key. Hibernate uses it for all `WHERE id = ?` queries — `findById`, `update`, `delete`. |
| `@GeneratedValue(strategy = GenerationType.UUID)` | Don't require the caller to set the ID. Let the database generate it on INSERT.                                         |
| `@Column(nullable = false)`                       | Mirrors the `NOT NULL` constraint from SQL. Hibernate enforces it before hitting the database.                          |
| `@Column(nullable = false, unique = true)`        | Same, plus mirrors the `UNIQUE` constraint.                                                                             |
| `@Column(nullable = false, updatable = false)`    | Once written on INSERT, Hibernate never includes this field in an UPDATE. The created date must never change.           |
| `@CreatedDate`                                    | Automatically set to the current timestamp when the entity is first saved.                                              |
| `@LastModifiedDate`                               | Automatically updated to the current timestamp on every save.                                                           |

**Why are `@Email` and `@NotBlank` not here?**

Those are validation annotations — they belong on the **DTO** (the object that receives raw JSON from HTTP), not the Domain class. By the time data reaches the Domain, it has already been validated. Each layer has one job:

```
CreateTenantRequest   ← @NotBlank, @Email — validate incoming data
        ↓
Tenant (domain)       ← @Column — map to the database
        ↓
PostgreSQL
```

#### Enabling JPA Auditing

`@CreatedDate` and `@LastModifiedDate` require one more thing — add `@EnableJpaAuditing` to the main application class:

```java
@EnableJpaAuditing
@SpringBootApplication
public class LearningApiApplication {
    public static void main(String[] args) {
        SpringApplication.run(LearningApiApplication.class, args);
    }
}
```

Without this, Spring never activates the auditing mechanism and those fields stay `null` silently.

---

### The Repository Layer

**File:** `src/main/java/com/learn/learning_api/repository/TenantRepository.java`

```java
public interface TenantRepository extends JpaRepository<Tenant, UUID> {
    boolean existsByEmail(String email);
}
```

This is an interface — you write zero implementation code. Spring Data JPA generates a real implementation class at startup, invisibly, based on your interface.

`extends JpaRepository<Tenant, UUID>` means: inherit all standard methods (`save`, `findById`, `deleteById`, etc.) and tell Spring this repository works with `Tenant` objects identified by `UUID` keys.

`existsByEmail` is a **derived query method** — Spring reads the method name and generates the SQL automatically:

```sql
SELECT COUNT(*) > 0 FROM tenants WHERE email = ?
```

The naming convention: start with `existsBy`, `findBy`, `deleteBy`, or `countBy` — then chain field names from your entity. No body needed.

#### The full database stack explained

```
TenantRepository       ← your interface — you work here
        ↓
Spring Data JPA        ← generates the implementation
        ↓
Hibernate              ← ORM — translates Java objects to SQL
        ↓
JPA                    ← specification Hibernate follows (@Entity, @Id etc.)
        ↓
JDBC                   ← sends SQL to the database over the network
        ↓
PostgreSQL             ← runs the SQL, returns rows
```

- **JPA** is not code — it's a _specification_ (a set of rules). Hibernate implements those rules.
- **Hibernate** generates SQL from your Java objects. You never write `SELECT * FROM tenants WHERE id = ?`.
- **JDBC** is Java's built-in standard for database connections — low level, raw SQL. Hibernate uses it under the hood.
- You only ever interact with `TenantRepository`. The five layers below are invisible.

---

### The DTO Layer

DTOs (Data Transfer Objects) carry data in and out of your API. They're completely separate from the domain layer — intentionally.

**File:** `src/main/java/com/learn/learning_api/dto/CreateTenantRequest.java`

```java
public record CreateTenantRequest(
    @NotBlank String name,
    @NotBlank @Email String email
) {}
```

**File:** `src/main/java/com/learn/learning_api/dto/TenantResponse.java`

```java
public record TenantResponse(
    UUID id,
    String name,
    String email,
    String status,
    LocalDateTime createdAt
) {}
```

#### Why `record` instead of `class`?

A `record` is a Java type designed for objects that just hold data. A regular class needs a constructor, getters, `equals()`, `hashCode()`, `toString()` — 30+ lines of boilerplate. A `record` gives all of that for free from a single line of field declarations.

#### Why keep DTOs separate from the domain?

The domain mirrors the database. The DTO is your contract with the outside world. They evolve independently:

- Your DB adds a `passwordHash` column → domain changes, DTO stays the same, clients never see it
- A client needs a new field → DTO changes, no reason to touch the DB schema

The DTOs don't reference `Tenant` at all — they're completely standalone. The **Mapper** (next section) is the only place where the translation between them happens.

```
CreateTenantRequest   →  [Mapper]  →  Tenant  →  saved to DB
Tenant (from DB)      →  [Mapper]  →  TenantResponse  →  sent to client
```

---

### The Mapper Layer

The Mapper is a plain Java class — no special Spring magic. Its only job is to translate between the domain and DTOs.

**File:** `src/main/java/com/learn/learning_api/mapper/TenantMapper.java`

```java
@Component
public class TenantMapper {

    public Tenant toEntity(CreateTenantRequest request) {
        Tenant tenant = new Tenant();
        tenant.setName(request.name());
        tenant.setEmail(request.email());
        return tenant;
    }

    public TenantResponse toResponse(Tenant tenant) {
        return new TenantResponse(
            tenant.getId(),
            tenant.getName(),
            tenant.getEmail(),
            tenant.getStatus(),
            tenant.getCreatedAt()
        );
    }
}
```

The mapping is explicit and manual — you tell Spring field by field what connects to what. This is intentional: if your DB schema changes, the Mapper is the only place you fix. The DTOs stay untouched.

**`@Component`** tells Spring to manage this object. Spring creates one instance at startup and hands it to whoever needs it — you never write `new TenantMapper()` yourself. This is called **Dependency Injection**.

**Records vs classes in the Mapper:** `request.name()` uses parentheses because `CreateTenantRequest` is a `record` — records expose fields as methods. `tenant.getName()` uses a getter because `Tenant` is a regular class.

**Position matters in records:** `new TenantResponse(...)` fills fields by position. `tenant.getId()` goes into position 1 (`id`), `tenant.getName()` into position 2 (`name`), etc. If you swap two values, Java won't complain — it'll silently put the wrong value in the wrong field.

---

### The Service Layer

The Service contains business logic — the rules of your application. It sits between the Controller and the Repository.

**File:** `src/main/java/com/learn/learning_api/service/TenantService.java`

```java
@Service
public class TenantService {

    private final TenantRepository tenantRepository;
    private final TenantMapper tenantMapper;

    public TenantService(TenantRepository tenantRepository, TenantMapper tenantMapper) {
        this.tenantRepository = tenantRepository;
        this.tenantMapper = tenantMapper;
    }

    public TenantResponse createTenant(CreateTenantRequest request) {
        if (tenantRepository.existsByEmail(request.email())) {
            throw new EmailAlreadyInUseException(request.email());
        }

        Tenant tenant = tenantMapper.toEntity(request);
        Tenant saved = tenantRepository.save(tenant);
        return tenantMapper.toResponse(saved);
    }
}
```

**`@Service`** — same idea as `@Component` but semantically signals "this is business logic."

**Constructor injection** — Spring sees that `TenantService` needs a `TenantRepository` and a `TenantMapper` in its constructor. It already manages both, so it wires them in automatically. You never write `new TenantRepository()`.

**`private final`** — fields are set once in the constructor and never change. Recommended style for injected dependencies.

**`createTenant` step by step:**

1. `existsByEmail` — hit the DB, reject if duplicate
2. `toEntity` — `CreateTenantRequest` → `Tenant`
3. `save` — INSERT into PostgreSQL, get back `Tenant` with generated `id` and timestamps
4. `toResponse` — `Tenant` → `TenantResponse`
5. return — goes back to the Controller

`save()` returns the saved `Tenant` — that's why we store it in a new variable `saved`. The returned object is now populated with the DB-generated `id` and `createdAt`.

---

### The Controller Layer

The Controller receives HTTP requests and returns HTTP responses. It knows nothing about the database — it just calls the Service.

**File:** `src/main/java/com/learn/learning_api/controller/TenantController.java`

```java
@RestController
@RequestMapping("/api/v1/tenants")
public class TenantController {

    private final TenantService tenantService;

    public TenantController(TenantService tenantService) {
        this.tenantService = tenantService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TenantResponse createTenant(@RequestBody @Valid CreateTenantRequest request) {
        return tenantService.createTenant(request);
    }
}
```

| Annotation                            | What it does                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `@RestController`                     | Spring-managed + serialize every return value to JSON automatically                    |
| `@RequestMapping("/api/v1/tenants")`  | Base URL for all methods in this class                                                 |
| `@PostMapping`                        | This method handles `POST` requests                                                    |
| `@ResponseStatus(HttpStatus.CREATED)` | Return HTTP `201` instead of default `200`                                             |
| `@RequestBody`                        | Deserialize the incoming JSON body into `CreateTenantRequest`                          |
| `@Valid`                              | Activate `@NotBlank` and `@Email` on the request object — without this they do nothing |

The return type is `TenantResponse` — what you send _back_. The `@RequestBody CreateTenantRequest` is what you _receive_. They're different directions.

Spring uses a library called **Jackson** (included automatically) to serialize the `TenantResponse` record into JSON. You never call it directly — `@RestController` handles it.

#### The complete flow for POST /api/v1/tenants

```
Client sends JSON
        ↓
Controller  (@RequestBody deserializes to CreateTenantRequest)
        ↓
Service  (existsByEmail → toEntity → save → toResponse)
        ↓
  TenantRepository.save()
        ↓
    Spring Data JPA → Hibernate → JDBC → PostgreSQL
        ↑
  Tenant returned with id + timestamps
        ↑
TenantMapper.toResponse() → TenantResponse
        ↑
Controller returns TenantResponse
        ↑
Jackson serializes to JSON → 201 Created
```

---

## Building the GET Endpoint — LedgerEntry

The second endpoint is `GET /api/v1/ledger/{tenantId}/entries/{entryId}`. It fetches a single ledger entry for a specific tenant. The URL has two **path variables** — values embedded directly in the URL.

We follow the same pattern as Tenant: domain → repository → DTO → mapper → service → controller.

### LedgerEntry Domain

**File:** `src/main/java/com/learn/learning_api/domain/LedgerEntry.java`

```java
@Entity
@Table(name = "ledger_entries")
@EntityListeners(AuditingEntityListener.class)
public class LedgerEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", nullable = false)
    private Tenant tenant;

    @Column(nullable = false)
    private String type;

    @Column(nullable = false)
    private Long amountCents;

    private String description;

    private UUID referenceId;

    @CreatedDate
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
```

Two new annotations compared to `Tenant`:

**`@ManyToOne(fetch = FetchType.LAZY)`** — many ledger entries can belong to one tenant. Instead of storing just a `UUID tenantId`, we store the whole `Tenant` object — Hibernate handles the join. `LAZY` means: don't load the `Tenant` from the database unless we actually access it. Without it (`EAGER`), every ledger entry fetch would also run a second query to load the full tenant — wasteful.

**`@JoinColumn(name = "tenant_id")`** — tells Hibernate which column holds the foreign key.

---

### LedgerEntry Repository

**File:** `src/main/java/com/learn/learning_api/repository/LedgerEntryRepository.java`

```java
public interface LedgerEntryRepository extends JpaRepository<LedgerEntry, UUID> {
    Optional<LedgerEntry> findByIdAndTenantId(UUID id, UUID tenantId);
}
```

**Why not just `findById`?** It's a security issue. `findById(entryId)` would let any tenant fetch any other tenant's entries by guessing an ID. `findByIdAndTenantId` generates:

```sql
SELECT * FROM ledger_entries WHERE id = ? AND tenant_id = ?
```

Both must match. Wrong tenant gets nothing back.

**Why `Optional<LedgerEntry>`?** The entry might not exist. `Optional` is Java's way of saying "this might return something, or nothing." We use this in the Service to return `404 Not Found` when the entry doesn't exist.

---

### LedgerEntry DTO

No request DTO needed — this is a GET endpoint, no body coming in.

**File:** `src/main/java/com/learn/learning_api/dto/LedgerEntryResponse.java`

```java
public record LedgerEntryResponse(
    UUID id,
    UUID tenantId,
    String type,
    Long amountCents,
    String description,
    UUID referenceId,
    LocalDateTime createdAt
) {}
```

---

### LedgerEntry Mapper

**File:** `src/main/java/com/learn/learning_api/mapper/LedgerEntryMapper.java`

```java
@Component
public class LedgerEntryMapper {

    public LedgerEntryResponse toResponse(LedgerEntry entry) {
        return new LedgerEntryResponse(
            entry.getId(),
            entry.getTenant().getId(),
            entry.getType(),
            entry.getAmountCents(),
            entry.getDescription(),
            entry.getReferenceId(),
            entry.getCreatedAt()
        );
    }
}
```

`entry.getTenant().getId()` — the domain holds a full `Tenant` object (because of `@ManyToOne`), but the client only needs the `tenantId`. We go one level deeper to get just the ID.

---

### LedgerEntry Service

**File:** `src/main/java/com/learn/learning_api/service/LedgerEntryService.java`

```java
@Service
public class LedgerEntryService {

    private final LedgerEntryRepository ledgerEntryRepository;
    private final LedgerEntryMapper ledgerEntryMapper;

    public LedgerEntryService(LedgerEntryRepository ledgerEntryRepository, LedgerEntryMapper ledgerEntryMapper) {
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.ledgerEntryMapper = ledgerEntryMapper;
    }

    public LedgerEntryResponse getEntry(UUID tenantId, UUID entryId) {
        return ledgerEntryRepository
                .findByIdAndTenantId(entryId, tenantId)
                .map(ledgerEntryMapper::toResponse)
                .orElseThrow(() -> new RuntimeException("Entry not found"));
    }
}
```

`findByIdAndTenantId` returns an `Optional<LedgerEntry>`. Instead of unpacking it with an `if/else`, we use a method chain:

- `.map(ledgerEntryMapper::toResponse)` — if the Optional has a value, transform it using the mapper. `::` is Java's method reference syntax — shorthand for `entry -> ledgerEntryMapper.toResponse(entry)`.
- `.orElseThrow(...)` — if the Optional is empty, throw an exception. We handle this properly with `@ControllerAdvice` covered later in the post.

This is the same security pattern as the repository: both `id` and `tenant_id` must match, so a tenant cannot access another tenant's entries.

---

### LedgerEntry Controller

**File:** `src/main/java/com/learn/learning_api/controller/LedgerEntryController.java`

```java
@RestController
@RequestMapping("/api/v1/ledger")
public class LedgerEntryController {

    private final LedgerEntryService ledgerEntryService;

    public LedgerEntryController(LedgerEntryService ledgerEntryService) {
        this.ledgerEntryService = ledgerEntryService;
    }

    @GetMapping("/{tenantId}/entries/{entryId}")
    public LedgerEntryResponse getEntry(
            @PathVariable UUID tenantId,
            @PathVariable UUID entryId) {
        return ledgerEntryService.getEntry(tenantId, entryId);
    }
}
```

Two new things compared to the POST controller:

**`@GetMapping`** — handles `GET` requests. No `@ResponseStatus` needed — Spring defaults to `200 OK` for GET, which is correct.

**`@PathVariable`** — extracts a value from the URL itself. The name in `{tenantId}` must match the parameter name `@PathVariable UUID tenantId`. Spring automatically parses the string from the URL into a `UUID`.

```
GET /api/v1/ledger/550e8400.../entries/7c9e6679...
                   ─────────────────   ─────────────────
                   @PathVariable       @PathVariable
                   UUID tenantId       UUID entryId
```

No `@RequestBody` here — GET requests carry no body. All the input comes from the URL.

---

## Exception Handling — @ControllerAdvice

By default, when the service throws a `RuntimeException`, Spring has no idea what HTTP status to use — it falls back to `500 Internal Server Error`. That's wrong for a duplicate email. The client made a mistake, so the correct status is `409 Conflict`.

The fix has 3 parts: a custom exception class, a handler class, and updating the service to throw the right thing.

---

### Step 1 — Custom Exception

**File:** `src/main/java/com/learn/learning_api/exception/EmailAlreadyInUseException.java`

```java
public class EmailAlreadyInUseException extends RuntimeException {
    public EmailAlreadyInUseException(String email) {
        super("Email already in use: " + email);
    }
}
```

Why a custom class instead of `RuntimeException`? So you can catch _this specific thing_ in the handler. If you caught `RuntimeException`, you'd accidentally catch every error in the app — database errors, null pointers, everything.

---

### Step 2 — Update the Service

In `TenantService`, replace:

```java
throw new RuntimeException("Email already in use");
```

with:

```java
throw new EmailAlreadyInUseException(request.email());
```

---

### Step 3 — GlobalExceptionHandler

**File:** `src/main/java/com/learn/learning_api/exception/GlobalExceptionHandler.java`

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(EmailAlreadyInUseException.class)
    public ResponseEntity<Map<String, String>> handleEmailAlreadyInUse(EmailAlreadyInUseException ex) {
        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(Map.of("error", ex.getMessage()));
    }
}
```

**`@RestControllerAdvice`** — marks this class as a global interceptor for exceptions that escape any controller. Spring scans for it at startup and registers it automatically.

**`@ExceptionHandler(EmailAlreadyInUseException.class)`** — this method only fires when that specific exception type is thrown. You can have many `@ExceptionHandler` methods in the same class, each for a different exception.

**`ResponseEntity<Map<String, String>>`** — lets you control the HTTP status code and body explicitly. `Map.of("error", ex.getMessage())` produces `{"error": "Email already in use: acme@example.com"}`.

### How the flow works

```
Client sends duplicate email
        ↓
Controller → Service → throws EmailAlreadyInUseException
        ↓
Exception bubbles up past the controller
        ↓
DispatcherServlet catches it, looks for a matching @ExceptionHandler
        ↓
GlobalExceptionHandler.handleEmailAlreadyInUse() fires
        ↓
Client receives: 409 Conflict  {"error": "Email already in use: ..."}
```

`@RestControllerAdvice` never runs on a happy path. It only activates when an exception escapes a controller — think of it as a safety net sitting next to the `DispatcherServlet`.

---

## API Documentation — Swagger / OpenAPI

Swagger gives you a browser UI at `/swagger-ui.html` that lists all your endpoints, their inputs, and their outputs. One dependency, zero configuration.

### Add the dependency

In `pom.xml`, inside `<dependencies>`:

```xml
<dependency>
    <groupId>org.springdoc</groupId>
    <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
    <version>2.8.8</version>
</dependency>
```

SpringDoc automatically scans your `@RestController` classes and generates the docs. Restart the app and open:

```
http://localhost:8081/swagger-ui.html
```

You'll see every endpoint with its HTTP method, URL, request body schema, and response schema — all derived from your existing code.

### Enriching with annotations

The auto-generated docs are functional but minimal. You can add descriptions with annotations:

```java
@Operation(summary = "Create a new tenant")
@ApiResponse(responseCode = "201", description = "Tenant created successfully")
@ApiResponse(responseCode = "400", description = "Invalid request body")
@ApiResponse(responseCode = "409", description = "Email already in use")
@PostMapping
@ResponseStatus(HttpStatus.CREATED)
public TenantResponse createTenant(@RequestBody @Valid CreateTenantRequest request) {
    return tenantService.createTenant(request);
}
```

| Annotation                           | What it does                                              |
| ------------------------------------ | --------------------------------------------------------- |
| `@Operation(summary = "...")`        | One-line description shown next to the endpoint in the UI |
| `@ApiResponse(responseCode = "...")` | Documents each possible HTTP response and what it means   |

These are purely documentation — they don't change any behavior.

---

## Pagination

Pagination returns results in chunks instead of all at once. Without it, `GET /api/v1/tenants` with 10,000 rows would dump everything in one response — slow and unusable.

The client controls it with query parameters:

```
GET /api/v1/tenants?page=0&size=20&sort=createdAt,desc
```

And gets back a `Page` object:

```json
{
  "content": ["..."],
  "totalElements": 10000,
  "totalPages": 500,
  "number": 0,
  "size": 20
}
```

Spring Data JPA has this built in — `JpaRepository` already has `findAll(Pageable)`. You don't touch the repository at all.

### Service

Add to `TenantService`:

```java
public Page<TenantResponse> getTenants(Pageable pageable) {
    return tenantRepository.findAll(pageable)
            .map(tenantMapper::toResponse);
}
```

`tenantRepository.findAll(pageable)` returns a `Page<Tenant>`. `.map(tenantMapper::toResponse)` converts each entity inside the page into a `TenantResponse` — the page metadata (total, size, etc.) is preserved automatically.

`Page` is like a `List` but with extra metadata: `totalElements`, `totalPages`, `number` (current page), `size`.

### Controller

Add to `TenantController`:

```java
@GetMapping
public Page<TenantResponse> getTenants(Pageable pageable) {
    return tenantService.getTenants(pageable);
}
```

Spring automatically reads `?page=0&size=20&sort=createdAt,desc` from the URL and converts it into a `Pageable` object for you — you never parse query params manually.

### Test it

```bash
curl "http://localhost:8081/api/v1/tenants?page=0&size=10"
```

Page numbers are **zero-based**: `page=0` is the first page, `page=1` is the second.

---

## Running the Application

Make sure your PostgreSQL container is running first (see environment setup above). Then from the project root:

```bash
./mvnw spring-boot:run
```

`./mvnw` is the **Maven Wrapper** — a script bundled with the project that downloads and runs the correct Maven version automatically. You don't need Maven installed globally. `spring-boot:run` tells Maven to compile the code and start the app in one shot.

### What happens when you run it

Spring Boot does several things in order on every startup:

**1. Compile** — Maven compiles all `.java` files into bytecode.

**2. Connect to the database** — Spring reads `application.yaml` and opens a connection pool to PostgreSQL via HikariCP. If the database is unreachable, the app stops here.

```
HikariPool-1 - Start completed.
```

**3. Run Flyway migrations** — Flyway checks which SQL migration files have already been applied and runs any new ones. On first run it creates the tables. On subsequent runs it skips already-applied files.

```
Database: jdbc:postgresql://localhost:5432/learning_api (PostgreSQL 16.14)
Successfully validated 1 migration (execution time 00:00.038s)
Schema "public" is up to date. No migration necessary.
```

**4. Validate the schema** — Hibernate reads your `@Entity` classes and checks that the database schema matches. If a column is missing or the type is wrong, the app stops here with a clear error.

```
Initialized JPA EntityManagerFactory for persistence unit 'default'
```

**5. Start the web server** — Tomcat (embedded in Spring Boot, no separate install needed) starts and begins accepting HTTP requests.

```
Tomcat started on port 8081
Started LearningApiApplication in 3.4 seconds
```

The app is ready. If any step fails, Spring Boot shuts down immediately and prints exactly what went wrong — it refuses to start in a broken state.

### Maven commands

| Command                  | What it does                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `./mvnw spring-boot:run` | Compile + run in one shot. Best for development.                                     |
| `./mvnw compile`         | Compile only — check for errors without running.                                     |
| `./mvnw test`            | Run all tests.                                                                       |
| `./mvnw package`         | Build a fat `.jar` at `target/learning-api-0.0.1-SNAPSHOT.jar`. Used for production. |

---

## Testing

### Testing with curl

Once the app is running, you can hit the endpoints from your terminal with `curl`.

**Create a tenant — happy path:**

```bash
curl -s -X POST http://localhost:8081/api/v1/tenants \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme Corp","email":"acme@example.com"}' | jq
```

Expected response (`201 Created`):

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "name": "Acme Corp",
  "email": "acme@example.com",
  "status": "ACTIVE",
  "createdAt": "2026-06-08T10:00:00"
}
```

---

**Create a tenant — invalid email:**

```bash
curl -s -X POST http://localhost:8081/api/v1/tenants \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme Corp","email":"not-an-email"}' | jq
```

Expected response (`400 Bad Request`) — caught by `@Valid` before reaching the service.

---

**Create a tenant — duplicate email:**

```bash
# Run the same request twice
curl -s -X POST http://localhost:8081/api/v1/tenants \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme Corp","email":"acme@example.com"}' | jq
```

Expected response (`409 Conflict`) — caught by `GlobalExceptionHandler`:

```json
{
  "error": "Email already in use: acme@example.com"
}
```

---

**List tenants with pagination:**

```bash
curl -s "http://localhost:8081/api/v1/tenants?page=0&size=10" | jq
```

Expected response (`200 OK`):

```json
{
  "content": [
    {
      "id": "3fa85f64-...",
      "name": "Acme Corp",
      "email": "acme@example.com",
      "status": "ACTIVE",
      "createdAt": "2026-06-08T10:00:00"
    }
  ],
  "totalElements": 1,
  "totalPages": 1,
  "number": 0,
  "size": 10
}
```

---

**Get a ledger entry:**

```bash
curl -s http://localhost:8081/api/v1/ledger/{tenantId}/entries/{entryId} | jq
```

Replace `{tenantId}` and `{entryId}` with real UUIDs from your database. Returns `200 OK` with the entry, or `500` if not found.

> `| jq` at the end of each curl pretty-prints the JSON response. Install it with `sudo apt install jq` if you don't have it.

---

### Unit and Integration Tests

There are three types of tests in a Spring Boot API:

| Type                                  | What it tests                          | Speed  | Needs DB? |
| ------------------------------------- | -------------------------------------- | ------ | --------- |
| Unit                                  | One class in isolation                 | Fast   | No        |
| Integration                           | Multiple layers together               | Slow   | Yes       |
| Slice (`@WebMvcTest`, `@DataJpaTest`) | One layer with Spring partially loaded | Medium | Depends   |

Run all tests with:

```bash
./mvnw test
```

**Unit tests** are the fastest and easiest to write. No database, no Spring — just plain Java. You instantiate the class directly and call its methods. If a class has dependencies (like a service that needs a repository), you replace those dependencies with **mocks** — fake objects you control.

**Integration tests** start the full application — real Spring context, real database. They're slow but they test that everything works together end to end.

We wrote unit tests for the mapper and service, and an integration test for the full tenant creation flow.

---

### Unit Test: TenantMapper

The mapper is the easiest starting point — no dependencies, just field mapping.

**File:** `src/test/java/com/learn/learning_api/mapper/TenantMapperTest.java`

```java
class TenantMapperTest {

    private final TenantMapper mapper = new TenantMapper();

    @Test
    void toEntity_mapsFieldsCorrectly() {
        CreateTenantRequest request = new CreateTenantRequest("Acme Corp", "acme@example.com");

        Tenant result = mapper.toEntity(request);

        assertEquals("Acme Corp", result.getName());
        assertEquals("acme@example.com", result.getEmail());
        assertEquals("ACTIVE", result.getStatus());
        assertNull(result.getId());
    }

    @Test
    void toResponse_mapsFieldsCorrectly() {
        Tenant tenant = new Tenant();
        tenant.setId(UUID.fromString("00000000-0000-0000-0000-000000000001"));
        tenant.setName("Acme Corp");
        tenant.setEmail("acme@example.com");
        tenant.setStatus("ACTIVE");
        tenant.setCreatedAt(LocalDateTime.of(2026, 1, 1, 0, 0));

        TenantResponse result = mapper.toResponse(tenant);

        assertEquals(UUID.fromString("00000000-0000-0000-0000-000000000001"), result.id());
        assertEquals("Acme Corp", result.name());
        assertEquals("acme@example.com", result.email());
        assertEquals("ACTIVE", result.status());
        assertEquals(LocalDateTime.of(2026, 1, 1, 0, 0), result.createdAt());
    }
}
```

**Key points:**

`private final TenantMapper mapper = new TenantMapper()` — we instantiate the class directly with `new`. No Spring, no `@Autowired`. That's what makes this a _unit_ test.

`assertEquals(expected, actual)` — always expected first, actual second. JUnit uses this order in error messages: _"expected X but was Y"_.

`result.name()` — record fields are accessed as methods with no `get` prefix. `result.getName()` would not compile.

`assertNull(result.getId())` — the mapper doesn't set the ID (that's the database's job). We verify it stays null.

---

### Unit Test: TenantService

The service has real business logic — the duplicate email check. It also depends on `TenantRepository` and `TenantMapper`. We don't want a real database, so we use **Mockito** to create fake versions of those dependencies.

Mockito is already included — it comes bundled with `spring-boot-starter-test`.

**File:** `src/test/java/com/learn/learning_api/service/TenantServiceTest.java`

```java
@ExtendWith(MockitoExtension.class)
class TenantServiceTest {

    @Mock
    private TenantRepository tenantRepository;

    @Mock
    private TenantMapper tenantMapper;

    @InjectMocks
    private TenantService tenantService;

    @Test
    void createTenant_savesAndReturnsResponse() {
        CreateTenantRequest request = new CreateTenantRequest("Acme Corp", "acme@example.com");

        Tenant tenant = new Tenant();
        tenant.setName("Acme Corp");
        tenant.setEmail("acme@example.com");

        Tenant saved = new Tenant();
        saved.setId(UUID.randomUUID());
        saved.setName("Acme Corp");
        saved.setEmail("acme@example.com");
        saved.setStatus("ACTIVE");
        saved.setCreatedAt(LocalDateTime.now());

        TenantResponse expectedResponse = new TenantResponse(
                saved.getId(), "Acme Corp", "acme@example.com", "ACTIVE", saved.getCreatedAt()
        );

        when(tenantRepository.existsByEmail("acme@example.com")).thenReturn(false);
        when(tenantMapper.toEntity(request)).thenReturn(tenant);
        when(tenantRepository.save(tenant)).thenReturn(saved);
        when(tenantMapper.toResponse(saved)).thenReturn(expectedResponse);

        TenantResponse result = tenantService.createTenant(request);

        assertEquals(expectedResponse, result);
        verify(tenantRepository).save(tenant);
    }

    @Test
    void createTenant_throwsWhenEmailAlreadyExists() {
        CreateTenantRequest request = new CreateTenantRequest("Acme Corp", "acme@example.com");

        when(tenantRepository.existsByEmail("acme@example.com")).thenReturn(true);

        RuntimeException ex = assertThrows(
                RuntimeException.class,
                () -> tenantService.createTenant(request)
        );

        assertEquals("Email already in use", ex.getMessage());
        verify(tenantRepository, never()).save(any());
    }
}
```

**Key concepts:**

**`@Mock`** — creates a fake object. All its methods do nothing by default and return `null`. You control what they return using `when(...).thenReturn(...)`.

**`@InjectMocks`** — creates the real `TenantService` and injects the mocks into its constructor automatically.

**`when(...).thenReturn(...)`** — scripts the fake's behavior for each test. Think of it as setting up the stage before a scene:

```
Test 1 — happy path:
  mock says: "email not found" → thenReturn(false)
  service proceeds → saves → returns response ✓

Test 2 — duplicate email:
  mock says: "email exists!" → thenReturn(true)
  service throws exception ✓
```

`existsByEmail` returns `false` in the happy path because `false` means "this email does not exist yet" — the service checks `if (existsByEmail(...))` and only throws when it returns `true`.

**`verify(tenantRepository).save(tenant)`** — asserts that `save()` was actually called. Without this, a test could pass even if the service forgot to save.

**`verify(tenantRepository, never()).save(any())`** — asserts that `save()` was _never_ called. In the duplicate email test, the service must bail out before touching the database.

**`assertThrows(...)`** — verifies that the lambda throws the expected exception. If it doesn't throw, the test fails.

---

_More coming as we build..._
