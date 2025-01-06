# Contributing guide <!-- omit in toc -->

Thank you for investing your time in contributing to our project! Any content contributions you make will be reflected on [Democracy Candidate](https://www.democracycandidate.us/) :us:.  The main contribution expected for this project is candidate profiles, and there's ample opportunity to contribute to guides and tooling that make it easier for candidates themselves to write a bio. Today, contributing a bio requires cloning this repo, making a fork, writing content for Hugo, and opening a pull request.

Read our [Code of Conduct](./CODE_OF_CONDUCT.md) to keep our community approachable and respectable.

## New contributor guide

To get an overview of the project, read the [README](../README.md) file. Candidate profiles consist of a folder that contains a markdown document and optionally, a photo or two.  Here is an example of [a complete candidate profile contribution](https://github.com/democracycandidate/democracycandidate/pull/3/files).  The intent of this project is to host simple candidate profiles, and links to external content such as full campaign sites are highly encouraged for anybody who wishes to provide more content about their candidate.

Here are some resources to help you get started with open-source contributions:

- [Set up Git](https://docs.github.com/en/get-started/getting-started-with-git/set-up-git)
- [Collaborating with pull requests](https://docs.github.com/en/github/collaborating-with-pull-requests)

## Getting started

If you would like to review your changes before they are published you can run the entire site on your local computer.  You will need to install some essentials.

- [Hugo Extended v0.124+](https://gohugo.io/installation/)
- [Node v20+](https://nodejs.org/en/download/)
- [Go v1.22+](https://go.dev/doc/install)

You will also benefit from a comprehensive editor for markdown such as [Visual Studio Code](https://code.visualstudio.com/).

Once you have installed those tools, forked this project to your [GitHub account](https://github.com/signup), and cloned it to your computer you need to run a few commands.

### 👉 Install Dependencies

Install all the dependencies using the following command.

```bash
npm install
```

### 👉 Development Command

Start the development server using the following command.

```bash
npm run dev
```

Once that is running you should be able to see all changes reflected immediately on your local computer.  Letting you edit your candidate profile without publishing any information until you are ready.
