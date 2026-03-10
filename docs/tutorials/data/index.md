# Data Analytics Tutorials

A hands-on series covering Tova's complete data toolkit. Each tutorial builds on real datasets and produces working output — CSV files, charts, database tables.

## Prerequisites

- [Install Tova](/getting-started/)
- Basic familiarity with [Tova syntax](/guide/variables)

## Sample Data

These tutorials use three CSV files. Create a `data/` directory in your project and save these files.

### `data/employees.csv`

```csv
id,name,department,title,salary,hire_date,city,performance_score,is_remote
1,Alice Chen,Engineering,Senior Engineer,145000,2019-03-15,San Francisco,4.5,true
2,Bob Martinez,Engineering,Staff Engineer,175000,2017-06-01,San Francisco,4.8,false
3,Carol White,Marketing,Marketing Manager,110000,2020-01-10,New York,3.9,true
4,David Kim,Engineering,Junior Engineer,95000,2022-08-20,Austin,3.5,false
5,Eva Johnson,Sales,Sales Director,160000,2018-04-12,New York,4.7,false
6,Frank Lee,Marketing,Content Lead,98000,2021-03-05,Chicago,4.1,true
7,Grace Park,Engineering,Senior Engineer,148000,2019-09-22,Austin,4.3,true
8,Hank Wilson,Sales,Account Executive,85000,2023-01-15,Chicago,3.2,false
9,Iris Brown,Engineering,Tech Lead,185000,2016-11-08,San Francisco,4.9,false
10,Jack Taylor,Sales,Sales Rep,72000,2023-06-01,Austin,3.0,true
11,Karen Davis,Engineering,Senior Engineer,152000,2018-07-14,New York,4.4,false
12,Leo Adams,Marketing,SEO Specialist,88000,2022-02-28,Chicago,3.7,true
13,Mia Thomas,Engineering,Junior Engineer,92000,2023-03-10,Austin,3.3,true
14,Noah Clark,Sales,Account Executive,88000,2021-09-01,New York,4.0,false
15,Olivia Wright,Engineering,Staff Engineer,170000,2017-12-01,San Francisco,4.6,true
16,Pat Harris,Marketing,VP Marketing,195000,2015-05-20,New York,4.8,false
17,Quinn Scott,Engineering,Principal Engineer,210000,2014-08-15,San Francisco,5.0,false
18,Rosa Green,Sales,Sales Manager,130000,2019-11-01,Chicago,4.2,false
19,Sam Nelson,Engineering,Senior Engineer,155000,2020-04-15,Austin,4.1,true
20,Tina Lopez,Marketing,Designer,95000,2022-05-10,Chicago,3.8,true
```

### `data/sales.csv`

```csv
transaction_id,employee_id,product,category,amount,quantity,date,region,customer_type
T001,5,CRM Pro,Software,45000,3,2024-01-15,Northeast,Enterprise
T002,2,Cloud Platform,Software,72000,1,2024-01-22,West,Enterprise
T003,8,Office Suite,Software,5500,10,2024-02-01,Midwest,SMB
T004,14,CRM Pro,Software,28000,2,2024-02-10,Northeast,Mid-Market
T005,5,Analytics Tool,Software,55000,5,2024-02-15,Northeast,Enterprise
T006,10,Office Suite,Software,3200,5,2024-02-20,South,SMB
T007,18,Cloud Platform,Software,38000,2,2024-03-01,Midwest,Mid-Market
T008,8,Laptop Pro,Hardware,12500,5,2024-03-05,Midwest,SMB
T009,5,Server Rack,Hardware,85000,2,2024-03-10,Northeast,Enterprise
T010,14,Analytics Tool,Software,22000,3,2024-03-15,Northeast,Mid-Market
T011,2,Security Suite,Software,48000,4,2024-03-20,West,Enterprise
T012,18,CRM Pro,Software,32000,2,2024-04-01,Midwest,Mid-Market
T013,10,Office Suite,Software,4800,8,2024-04-05,South,SMB
T014,5,Cloud Platform,Software,95000,3,2024-04-10,Northeast,Enterprise
T015,8,Laptop Pro,Hardware,7500,3,2024-04-15,Midwest,SMB
T016,14,Security Suite,Software,18000,2,2024-04-20,Northeast,Mid-Market
T017,2,Analytics Tool,Software,62000,4,2024-05-01,West,Enterprise
T018,18,Server Rack,Hardware,42000,1,2024-05-05,Midwest,Enterprise
T019,5,CRM Pro,Software,51000,3,2024-05-10,Northeast,Enterprise
T020,10,Office Suite,Software,2400,4,2024-05-15,South,SMB
T021,8,Cloud Platform,Software,15000,1,2024-05-20,Midwest,Mid-Market
T022,14,Laptop Pro,Hardware,10000,4,2024-06-01,Northeast,SMB
T023,2,Security Suite,Software,58000,5,2024-06-05,West,Enterprise
T024,18,Analytics Tool,Software,35000,3,2024-06-10,Midwest,Mid-Market
T025,5,Server Rack,Hardware,68000,2,2024-06-15,Northeast,Enterprise
```

### `data/projects.csv`

```csv
project_id,project_name,lead_id,department,budget,spent,status,start_date,deadline
P001,Cloud Migration,9,Engineering,500000,320000,active,2024-01-01,2024-12-31
P002,Mobile App v2,2,Engineering,300000,180000,active,2024-02-01,2024-09-30
P003,Brand Refresh,16,Marketing,150000,95000,active,2024-03-01,2024-08-31
P004,Data Pipeline,7,Engineering,200000,50000,active,2024-04-01,2025-03-31
P005,Sales Portal,1,Engineering,250000,175000,active,2024-01-15,2024-10-31
P006,Q3 Campaign,3,Marketing,100000,72000,active,2024-07-01,2024-09-30
P007,API Gateway,11,Engineering,180000,45000,planning,2024-06-01,2025-01-31
P008,CRM Integration,5,Sales,120000,88000,active,2024-03-15,2024-11-30
P009,Security Audit,9,Engineering,80000,80000,completed,2024-01-01,2024-06-30
P010,Analytics Dashboard,15,Engineering,160000,20000,planning,2024-07-01,2025-06-30
```

## Learning Path

| # | Tutorial | Difficulty | Time |
|---|----------|-----------|------|
| 1 | [Getting Started with Tables](./getting-started) | Beginner | 15 min |
| 2 | [Grouping & Aggregation](./grouping) | Beginner | 15 min |
| 3 | [Joins & Combining Data](./joins) | Intermediate | 20 min |
| 4 | [Window Functions](./window-functions) | Intermediate | 20 min |
| 5 | [Data Cleaning](./data-cleaning) | Intermediate | 20 min |
| 6 | [Multi-Format I/O](./multi-format-io) | Intermediate | 20 min |
| 7 | [Lazy Pipelines](./lazy-pipelines) | Intermediate | 15 min |
| 8 | [Visualization](./visualization) | Beginner | 15 min |
| 9 | [Sampling & Reshaping](./sampling-reshaping) | Intermediate | 15 min |

## Quick Reference

While working through tutorials, keep these references handy:

- [Tables API Reference](/stdlib/tables) — all table functions with signatures
- [Tables & Data Guide](/guide/data) — column expressions, operation overview
- [I/O Guide](/guide/io) — file reading and writing details
- [Tova for Data Professionals](/guide/data-professionals) — tiered guide from analyst to full-stack
