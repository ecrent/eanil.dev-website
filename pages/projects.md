---
title: Projects - Anil Talasli
display: Projects
description: Projects I have built
wrapperClass: 'text-center'
art: dots
projects:
  Backend & Cloud:
    - name: 'JWT Decoupling Strategy'
      link: 'https://github.com/ecrent'
      desc: 'MSc thesis: reduced gRPC latency 50% and network traffic 15% in a Google Cloud microservices environment via JWT decoupling and gRPC Interceptors'
      icon: 'i-ri-cloud-line'

    - name: 'Secure REST API'
      link: 'https://github.com/ecrent'
      desc: 'Spring Boot service with RBAC, JWT authentication, and encrypted data exchange across distributed systems'
      icon: 'i-ri-shield-keyhole-line'

  Full-Stack & DevOps:
    - name: 'Full-Stack AWS App'
      link: 'https://github.com/ecrent'
      desc: 'End-to-end web application deployed to AWS with auth, secure traffic, metric monitoring, and CI/CD practices'
      icon: 'i-ri-layout-line'

  Data Engineering:
    - name: 'Real-Time Analytics Pipeline'
      link: 'https://github.com/ecrent'
      desc: 'Kafka + Spark + Elasticsearch pipeline for e-commerce analytics; fully containerized with Docker'
      icon: 'i-ri-database-2-line'
---

<ListProjects :projects="frontmatter.projects" />
