# Microsoft RPA Integration: Setup Guide

This document tracks the experimental side-project for running **Webtest Scanner** purely through the Microsoft 365 ecosystem. By using Robotic Process Automation (RPA), we can bypass cloud backend execution and securely run the headed browser directly on the user's local Windows machine.

## Architecture Overview

Instead of Next.js, Vercel, and Firebase, this branch utilizes:
1. **SharePoint Lists** (The Database)
2. **Power Apps Canvas App** (The User Interface)
3. **Power Automate Desktop** (The Local Execution Engine)

---

## Phase 1: The Database (SharePoint Setup)

Before building a UI or an execution script, we need a place to store data. We will use a standard SharePoint List.

1. Go to your Microsoft 365 account and open **SharePoint**.
2. Create a **Blank List** named `Webtest_Runs`.
3. Add the following columns:
   - `Title` *(Default column, we will use this for the Run ID)*
   - `TargetURL` *(Type: Single line of text)*
   - `AuditPrompt` *(Type: Multiple lines of text)*
   - `Status` *(Type: Choice -> Options: "Pending", "Running", "Completed", "Failed")*
   - `ResultsJSON` *(Type: Multiple lines of text)*

## Phase 2: The Execution Engine (Power Automate Desktop)

This replaces the Vercel cloud and Puppeteer. We will write a script that physically opens Chrome or Edge on your screen.

1. Open **Power Automate Desktop** on your Windows 11 machine (it comes pre-installed, or can be downloaded from the Microsoft Store).
2. Create a new flow called `Webtest Scanner Local Engine`.
3. **The Logic (To be implemented):**
   - Connect to the SharePoint list and look for items where `Status = Pending`.
   - Launch New Chrome/Edge instance targeting the `TargetURL`.
   - Extract data or perform QA based on the `AuditPrompt`.
   - Update the SharePoint List item to `Completed` and save the output to `ResultsJSON`.

## Phase 3: The UI (Power Apps)

This replaces our Next.js React frontend.

1. Go to **make.powerapps.com**.
2. Create a **Blank Canvas App**.
3. Connect the app to your `Webtest_Runs` SharePoint list.
4. **The Logic:**
   - Add a Text Input for the URL.
   - Add a Text Input for the Prompt.
   - Add a Button ("Run Audit"). When clicked, it uses the `Patch()` function to create a new row in SharePoint with the `Status` set to "Pending".

---

*Note: The actual Power Automate Desktop script code (Robin/PAD format) will be saved in this repository once generated.*
