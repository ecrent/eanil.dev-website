---
title: Projects - Anil Talasli
display: Projects
description: Projects I have built
wrapperClass: 'text-center'
projects:
  Backend & Cloud:
    - name: 'JWT Decoupling Strategy'
      link: 'https://github.com/ecrent/microservices-demo-jwt-split'
      desc: 'MSc thesis: quantifiable decrease in gRPC latency and network traffic in a Google Cloud microservices environment via JWT decoupling and gRPC Interceptors'
      icon: 'i-ri-cloud-line'

    - name: 'Secure REST API'
      link: 'https://github.com/ecrent/billing-api'
      desc: 'Spring Boot service with RBAC, JWT authentication, and encrypted data exchange across distributed systems'
      icon: 'i-ri-shield-keyhole-line'

  Full-Stack & DevOps:
    - name: 'Full-Stack AWS App'
      link: 'https://github.com/ecrent/web-development-project'
      desc: 'End-to-end web application deployed to AWS with auth, secure traffic, metric monitoring, and CI/CD practices'
      icon: 'i-ri-layout-line'

  Data Engineering:
    - name: 'Real-Time Analytics Pipeline'
      link: 'https://github.com/ecrent/data-pipeline-project'
      desc: 'Kafka + Spark + Elasticsearch pipeline for e-commerce analytics; fully containerized with Docker'
      icon: 'i-ri-database-2-line'
---

<ListProjects :projects="frontmatter.projects" />
