# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This project is a **Standard Drawing Repository and Configuration System** built around PTC Onshape, Arena PLM, and a remote user interface.
The project must be developed in clearly separated phases.
Do not attempt to build the entire system at once.
The primary development order is:
1. Build the scalable Onshape document structure.
2. Define configuration and drawing-generation standards.
3. Design automatic part numbering.
4. Design the release and revision workflow into Arena PLM.
5. Develop the remote user interface.
6. Integrate the UI with the controlled engineering systems.
The engineering data structure must be established before the remote user interface becomes the primary focus.

---

# Existing Reference Documents
The new system should build upon and learn from the existing:
* **Inventory Head and Footboard Library**
* **SMP Head and Footboard Library**

These documents should be treated as the current reference implementations for the headboard and footboard library concept.

Before significantly redesigning the Onshape structure:
1. Review how these documents are currently organised.
2. Identify useful existing configuration logic.
3. Identify reusable Part Studios.
4. Identify existing assemblies.
5. Identify drawing generation methods.
6. Identify naming conventions.
7. Identify limitations that prevent scalability.
8. Preserve useful engineering logic wherever practical.

Do not rebuild existing functionality simply for architectural consistency unless there is a clear benefit.
The objective is to evolve the current library concept into a scalable standard rather than create an unrelated replacement.

---

# Core Project Principle
The project must be designed around the following hierarchy:

```text
Engineering Library
        ↓
Configurable Standard Designs
        ↓
Controlled Assemblies
        ↓
Standard Drawing Outputs
        ↓
Automatic Part Numbers
        ↓
Arena PLM Release
        ↓
Remote User Interface
```

The user interface is downstream of the engineering structure.
Do not allow UI requirements to force duplication of engineering logic that should remain within Onshape.

---

# Project Phases

# PHASE 1 — Onshape Library Architecture

## Objective
Create a scalable Onshape document architecture for standard configurable products.
This phase establishes the foundation for all later work.

The immediate focus should be:
* Part Studios.
* Configurations.
* Assemblies.
* Drawing outputs.
* Metadata.
* Naming conventions.
* Reuse.
* Scalability.

The structure should initially be developed using the existing Inventory and SMP Head and Footboard libraries as reference designs.

---

## 1.1 Review Existing Libraries
Review:
```text
Inventory Head and Footboard Library
SMP Head and Footboard Library
```

Document:
* Current Part Studio structure.
* Existing variables.
* Existing configuration tables.
* Existing assemblies.
* Existing derived parts.
* Drawing structure.
* Drawing templates.
* Configuration naming.
* Existing part numbers.
* Existing metadata.
* Existing manual processes.
* Existing duplication.
* Known limitations.

Identify which concepts should become standard across the new repository.

---

## 1.2 Define the Standard Onshape Document Structure
Create a repeatable structure that can support many product families.

A typical configurable product library may contain:

```text
Product Library
│
├── Master Variables / Configuration
│
├── Part Studios
│   ├── Primary Components
│   ├── Secondary Components
│   ├── Shared Components
│   └── Configurable Components
│
├── Assemblies
│   ├── Main Assembly
│   ├── Manufacturing Assembly
│   └── Drawing Assembly
│
├── Drawings
│   ├── Assembly Drawing
│   ├── Component Drawings
│   └── Configured Output
│
└── Reference / Development
```

This is a conceptual structure.
The final structure should be based on what is technically appropriate within Onshape.
Do not create unnecessary tabs merely to match this example.

---

# 1.3 Part Studio Strategy
Define clear rules for when to use:
* A single configurable Part Studio.
* Multiple Part Studios.
* Derived parts.
* Shared standard components.
* Separate manufacturing components.
* Separate reference geometry.

Prefer reusable parametric logic over duplicated models.
Where products share common geometry, consider whether that geometry should originate from a common controlled source.
Avoid creating separate copies of almost-identical Part Studios for every product variation.

---

# 1.4 Configuration Strategy
Configurations are central to this project.

Determine how product variants should be controlled using:
* Configuration inputs.
* Configuration tables.
* Variables.
* Feature suppression.
* Lookup tables.
* Conditional logic.
* Standard options.
* Custom dimensions.

Separate configuration inputs into logical categories.

For example:
```text
Product Family
Size
Width
Height
Material
Style
Mounting Type
Manufacturing Option
Customer-Specific Dimension
```

Do not expose every internal design variable as a configuration parameter.
Only parameters that are meaningful to the product definition or future UI should become user-configurable.

---

# 1.5 Configuration Naming
Create consistent machine-readable configuration names.
Avoid configuration descriptions that rely exclusively on human-readable text.
Prefer structures that can later be consumed through APIs.

For example:
```text
family = SMP
width = 900
height = 1100
style = standard
```

rather than relying only on:
```text
SMP Standard 900 x 1100
```

Human-readable descriptions can still be generated from the structured data.

---

# 1.6 Configuration IDs
Each valid configuration should eventually be uniquely identifiable.

A configuration identity may need to include:
```text
product_family
configuration_code
configuration_parameters
part_number
revision
```

Do not rely purely on an automatically generated Onshape configuration string if a more stable business identifier is required.

---

# 1.7 Assembly Strategy
Define when assemblies are required and what purpose each assembly serves.

Potential assembly types:
```text
Engineering Assembly
Manufacturing Assembly
Drawing Assembly
Configured Product Assembly
```

Avoid creating unnecessary assembly duplication.
Where possible, use configuration-driven assemblies.
Assemblies should correctly inherit the configuration of the parts they contain.

---

# 1.8 Shared Components
Identify components that may be common between:
* Inventory products.
* SMP products.
* Future product families.

Examples may include:
* Brackets.
* Fixings.
* Standard frames.
* Common structural components.
* Standard purchased parts.

Determine whether these components should exist in:
* The same document.
* A separate standard component library.
* Released shared Onshape documents.

The chosen structure must support controlled reuse without creating fragile document dependencies.

---

# 1.9 Drawing Output Strategy
Define a standard output structure for drawings.
Drawings should eventually be suitable for controlled release into Arena PLM.

Determine required drawing types.

Potential outputs include:
```text
General Arrangement Drawing
Manufacturing Drawing
Assembly Drawing
Individual Part Drawing
Customer Drawing
Configured Drawing
```

The exact required outputs should be documented before automation is implemented.

---

# 1.10 Drawing Format Standard
Define a consistent drawing output format.

This should include:
* Sheet size.
* Drawing template.
* Border.
* Title block.
* Part number.
* Drawing number.
* Revision.
* Description.
* Material.
* Finish.
* Units.
* Scale.
* Approval information.
* Arena information where required.

Determine which fields should be:
```text
Automatically populated
Manually entered
Derived from Onshape metadata
Derived from Arena PLM
```

Avoid manual duplication of information that already exists in a controlled source.

---

# 1.11 Drawing Templates
Create standard drawing templates suitable for automatic drawing generation.
Templates should be designed with future API-driven workflows in mind.
Where practical, fields should be linked to structured metadata rather than manually typed.

---

# 1.12 Metadata Standard
Define common metadata fields across all standard designs.

Potential fields include:
```text
product_family
product_type
drawing_number
part_number
description
material
finish
configuration_code
revision
lifecycle_status
configurable
onshape_document_id
onshape_element_id
arena_item_id
```

Do not create inconsistent metadata names across product families.

The metadata structure should eventually support:
* Search.
* Part numbering.
* Arena integration.
* User interface filtering.
* Traceability.

---

# 1.13 Naming Conventions
Define consistent naming conventions for:
```text
Documents
Part Studios
Parts
Assemblies
Drawings
Configurations
Variables
Features
Metadata
```

Names should make sense both to engineers and to automated systems.

Avoid names such as:
```text
Part Studio 1
Assembly 2
New Drawing
Copy of Final
Final Final
```

---

# 1.14 Scalability Requirement
The architecture must not be designed specifically for only Inventory and SMP headboards and footboards.
Those libraries are the starting point.
The architecture should support future product families without major restructuring.

Before implementing a design decision, consider:
```text
Will this still work with 10 product families?
Will this still work with 100 configurable designs?
Will this still work with thousands of released configurations?
```

Avoid architecture that requires a separate application implementation for every product family.

---

# 1.15 Phase 1 Deliverables
Phase 1 should produce:
* [ ] Review of the Inventory Head and Footboard Library.
* [ ] Review of the SMP Head and Footboard Library.
* [ ] Proposed standard document structure.
* [ ] Standard Part Studio architecture.
* [ ] Standard configuration architecture.
* [ ] Standard assembly architecture.
* [ ] Standard drawing architecture.
* [ ] Drawing output specification.
* [ ] Drawing template standard.
* [ ] Metadata standard.
* [ ] Naming convention.
* [ ] Shared component strategy.
* [ ] Scalability review.
* [ ] Example implementation using at least one existing product family.

Do not move into full UI development until this structure is sufficiently stable.

---

# PHASE 2 — Automatic Part Numbering

## Objective
Design a reliable method of automatically assigning part and drawing numbers to controlled configurations and components.
Part numbering must be addressed before release automation is finalised.

---

# 2.1 Determine Numbering Scope
Define which objects require numbers.

Potential examples:
* Individual manufactured parts.
* Purchased components.
* Assemblies.
* Configured assemblies.
* Drawings.
* Standard designs.
* Customer-specific configurations.

Do not assume everything requires a unique number.

---

# 2.2 Define Numbering Authority
Determine which system owns the official number.

Potential authorities include:
```text
Arena PLM
Onshape
External numbering service
Application database
ERP / business system
```

There must be one authoritative source.
Avoid allowing Onshape and Arena to independently generate conflicting numbers.

---

# 2.3 Numbering Strategy
Determine whether numbering will be:
```text
Sequential
Structured
Product-family based
Arena-generated
Externally generated
Hybrid
```

Avoid embedding excessive engineering meaning into identifiers unless required by company standards.

---

# 2.4 Number Reservation
If numbers are assigned before release, define how a number is reserved.

The system must prevent:
* Duplicate numbers.
* Number collisions.
* Two engineers receiving the same number.
* Abandoned numbers being silently reused where prohibited.

---

# 2.5 Number Assignment Workflow
A possible workflow is:
```text
Configuration Created
        ↓
Determine whether a new controlled item is required
        ↓
Request Part Number
        ↓
Reserve Number
        ↓
Write Number to Onshape Metadata
        ↓
Create / Update Drawing
        ↓
Prepare Arena Item
```

The final process must reflect the company's actual numbering rules.

---

# 2.6 Part Number Mapping
Maintain a reliable mapping between:
```text
Part Number
Onshape Document
Onshape Element
Configuration
Arena Item
Revision
```

This mapping is essential for later automation.

---

# 2.7 Phase 2 Deliverables
* [ ] Part numbering requirements.
* [ ] Identification of numbering authority.
* [ ] Part numbering format.
* [ ] Reservation mechanism.
* [ ] Duplicate prevention.
* [ ] Configuration-to-part-number mapping.
* [ ] Onshape metadata update process.
* [ ] API workflow prototype.
* [ ] Error-handling process.

---

# PHASE 3 — Arena PLM Release Workflow

## Objective
Create a controlled workflow that connects configured Onshape designs to Arena PLM.
Arena should provide formal lifecycle and revision control.

---

# 3.1 Arena Responsibilities
Arena should be treated as the controlled source for:
* Released part number.
* Released drawing number.
* Revision.
* Lifecycle state.
* Approval.
* Change control.
* Historical releases.
* Obsolescence.

Onshape should remain responsible for the engineering CAD definition.

---

# 3.2 Release Workflow
Design the release workflow before attempting to fully automate it.

A potential workflow is:
```text
Design Complete in Onshape
        ↓
Configuration Validated
        ↓
Part Number Assigned
        ↓
Drawing Generated
        ↓
Release Package Created
        ↓
Arena Item Created / Updated
        ↓
Files Uploaded
        ↓
Review
        ↓
Approval
        ↓
Release
        ↓
Release Status Returned to Repository
```

The exact workflow must follow existing company procedures.

---

# 3.3 Release Package
Determine what data is required for Arena.

Potential release information includes:
```text
Part Number
Drawing Number
Description
Revision
Product Family
Configuration
Drawing PDF
DXF
STEP
Other Manufacturing Outputs
Onshape Link
Metadata
BOM
```

Do not automatically generate unnecessary outputs.

---

# 3.4 Revision Control
Clearly distinguish:
```text
Onshape Workspace
Onshape Version
Onshape Release
Arena Revision
Arena Lifecycle State
```

Never assume these are equivalent.

---

# 3.5 Release Automation Levels
Implement release automation gradually.

Possible levels:

### Level 1
Manual Arena release with automatic preparation of data.

### Level 2
Automatic creation of Arena items and upload of outputs.

### Level 3
Automated release workflow initiation.

### Level 4
Highly automated end-to-end configuration and release.

Do not skip directly to fully automated release without first validating the workflow.

---

# 3.6 Failure Handling
A release failure must not leave the systems in an ambiguous state.

For example:
```text
Part number reserved
Onshape updated
Arena item creation failed
```

The system must detect and report this state.
Never silently assign another part number to hide the failure.

---

# 3.7 Phase 3 Deliverables
* [ ] Arena object model understood.
* [ ] Release workflow documented.
* [ ] Revision workflow documented.
* [ ] Arena metadata mapping.
* [ ] Required file outputs defined.
* [ ] Onshape-to-Arena mapping defined.
* [ ] Release package prototype.
* [ ] API integration prototype.
* [ ] Failure and recovery workflow.
* [ ] Audit requirements.
* [ ] Pilot release completed.

---

# PHASE 4 — Remote User Interface

## Objective
Develop an external interface that allows users to access the engineering library without manually navigating the underlying Onshape structure.
The UI should consume the engineering architecture established in Phases 1–3.
Do not recreate Onshape configuration logic in the UI unless necessary.

---

# 4.1 Primary User Workflows
The interface should support:
```text
Search
Browse
View Drawing
Retrieve Drawing
Configure Standard Product
Generate Custom Configuration
Check Release Status
```

---

# 4.2 Search
Users should be able to search using:
* Drawing number.
* Part number.
* Description.
* Product type.
* Product family.
* Category.
* Application.
* Dimensions.
* Keywords.

Search should prioritise released designs by default.

---

# 4.3 Browsing
Users should be able to browse product families.

For example:
```text
Standard Designs
│
├── Inventory
│   ├── Headboards
│   └── Footboards
│
├── SMP
│   ├── Headboards
│   └── Footboards
│
└── Future Product Families
```

The UI taxonomy should be driven by metadata rather than hard-coded page structures wherever possible.

---

# 4.4 Drawing Information
Each design should provide:
* Product name.
* Part number.
* Drawing number.
* Description.
* Revision.
* Lifecycle state.
* Drawing preview where available.
* Relevant dimensions.
* Configuration details.
* Download options.
* Onshape reference where appropriate.

---

# 4.5 Custom Configuration
A dedicated configuration workflow should allow users to create approved product variants.

Example:
```text
Select Product Family
        ↓
Select Base Design
        ↓
Load Configuration Inputs
        ↓
Enter Values
        ↓
Validate
        ↓
Preview
        ↓
Generate Configuration
```

Configuration options should ideally originate from Onshape or a synchronised controlled definition.
Avoid manually duplicating parameter lists in frontend source code.

---

# 4.6 Validation
Frontend validation should improve usability.
Authoritative validation must also occur at a trusted backend or engineering layer.

Validate:
* Data type.
* Required inputs.
* Minimum values.
* Maximum values.
* Valid options.
* Parameter dependencies.
* Invalid combinations.
* Units.

---

# 4.7 Generated Configuration Workflow
A future workflow may be:
```text
User Configuration
        ↓
Validation
        ↓
Onshape Configuration Generated
        ↓
Determine Whether New Part Number Required
        ↓
Part Number Assigned
        ↓
Drawing Generated
        ↓
Arena Release Process
        ↓
Released Output Available to User
```

Do not implement this full workflow until the earlier project phases are proven.

---

# PHASE 5 — Integration and Automation

## Objective
Connect the remote UI, Onshape configuration system, part numbering, and Arena release workflow.
This phase should primarily orchestrate systems rather than introduce new engineering rules.

---

# Overall System Architecture
The target architecture is:

```text
                    ┌─────────────────────┐
                    │   Remote User UI    │
                    │                     │
                    │ Search              │
                    │ Browse              │
                    │ Configure           │
                    │ Retrieve            │
                    └─────────┬───────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Application Backend │
                    │                     │
                    │ Search              │
                    │ Validation          │
                    │ Orchestration       │
                    │ Numbering           │
                    └─────────┬───────────┘
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
      ┌────────────┐    ┌────────────┐   ┌────────────┐
      │  Onshape   │    │ Arena PLM  │   │ Search /   │
      │            │    │            │   │ Metadata   │
      │ CAD        │    │ Revisions  │   │ Index      │
      │ Configs    │    │ Releases   │   │            │
      │ Drawings   │    │ Approval   │   │            │
      └────────────┘    └────────────┘   └────────────┘
```

---

# Source-of-Truth Rules
Unless later architecture decisions override them:

| Information                       | Primary Source                                |
| ---------------------------------- | --------------------------------------------- |
| CAD geometry                      | Onshape                                       |
| Parametric model                  | Onshape                                       |
| Engineering configuration logic   | Onshape                                       |
| Drawing geometry                  | Onshape                                       |
| Product configuration definitions | Onshape / controlled configuration definition |
| Part number                       | Authoritative numbering system                |
| Released revision                 | Arena PLM                                     |
| Lifecycle status                  | Arena PLM                                     |
| Approval status                   | Arena PLM                                     |
| Change history                    | Arena PLM                                     |
| Search index                      | Application                                   |
| User interface metadata           | Synchronised application data                 |

If two authoritative systems disagree, do not silently resolve the discrepancy.

---

# Key Engineering Rule
Do not duplicate engineering configuration logic unnecessarily.

Where possible:
```text
Onshape defines what can be configured.
Application backend validates and orchestrates.
Arena controls what has been released.
UI allows the user to interact with those systems.
```

---

# Development Priorities
When deciding what to work on next, use this priority order:
1. Onshape document architecture.
2. Configurable CAD structure.
3. Drawing generation standard.
4. Metadata and naming.
5. Scalability.
6. Part numbering.
7. Arena release workflow.
8. Remote UI.
9. End-to-end automation.

Do not prioritise UI polish ahead of engineering architecture.

---

# Scalability Principles
Every major design decision should consider future scale.

The system should support:
```text
Multiple product families
Hundreds of standard designs
Thousands of configurations
Many users
Multiple released revisions
Shared components
Future manufacturing outputs
```

Avoid:
* One document per configuration unless technically required.
* Hard-coded product-family logic.
* Hard-coded UI configuration forms.
* Copying entire models to create new size variants.
* Manual metadata duplication.
* Manual part-number assignment where automation is intended.
* UI structures that need code changes for every new product family.

---

# Integration Boundaries

## Onshape Integration
Keep Onshape logic within a dedicated service.

Suggested structure:
```text
services/
    onshape/
        client
        documents
        part_studios
        assemblies
        configurations
        drawings
        metadata
        exports
```

---

## Arena Integration
Suggested structure:
```text
services/
    arena/
        client
        items
        numbering
        revisions
        lifecycle
        releases
        attachments
```

---

## Search / Repository Service
Suggested structure:
```text
services/
    repository/
        indexing
        search
        metadata
        synchronization
```

---

# Engineering Data Safety
Engineering data should always take priority over application convenience.

Do not:
* Invent engineering dimensions.
* Modify parameter limits to make a configuration succeed.
* Assume units.
* Assume an unreleased model is approved.
* Replace Arena revision logic with application logic.
* Generate duplicate part numbers.
* Remove traceability.
* Automatically overwrite released records.
* Create engineering configurations outside approved ranges.

---

# Units
All configurable engineering values must have explicit units.

Prefer structures such as:
```json
{
  "value": 1200,
  "unit": "mm"
}
```

Never assume a numeric value represents millimetres simply because most existing models use millimetres.

---

# Traceability
Every controlled configuration should eventually be traceable through:
```text
Product Family
        ↓
Standard Design
        ↓
Onshape Configuration
        ↓
Part Number
        ↓
Drawing Number
        ↓
Arena Item
        ↓
Released Revision
```

Custom designs should additionally retain the parameter values used to create them.

---

# Development Workflow for Claude
Before implementing a significant change:
1. Determine which project phase the work belongs to.
2. Do not implement features belonging to later phases unless required.
3. Review existing relevant code and engineering structure.
4. Review the Inventory or SMP reference libraries where relevant.
5. Identify the authoritative source of the information.
6. Identify scalability implications.
7. Identify revision-control implications.
8. Make the smallest coherent implementation.
9. Test the implementation.
10. Document significant architectural decisions.

---

# Current Project Roadmap

## Phase 1 — Onshape Architecture
* [ ] Review Inventory Head and Footboard Library.
* [ ] Review SMP Head and Footboard Library.
* [ ] Document existing configuration methods.
* [ ] Identify reusable existing engineering logic.
* [ ] Define scalable document architecture.
* [ ] Define Part Studio structure.
* [ ] Define shared component strategy.
* [ ] Define configuration architecture.
* [ ] Define configuration naming.
* [ ] Define assembly structure.
* [ ] Define drawing output requirements.
* [ ] Define drawing templates.
* [ ] Define metadata structure.
* [ ] Define naming conventions.
* [ ] Implement first standardised library.
* [ ] Validate architecture against additional product families.
* [ ] Confirm scalability.

## Phase 2 — Part Numbering
* [ ] Document current part numbering process.
* [ ] Identify authoritative numbering system.
* [ ] Define numbering rules.
* [ ] Define which objects receive part numbers.
* [ ] Define number reservation process.
* [ ] Prevent duplicate allocation.
* [ ] Map numbers to Onshape configurations.
* [ ] Automate metadata population.
* [ ] Prototype numbering workflow.

## Phase 3 — Arena PLM
* [ ] Document current Arena release workflow.
* [ ] Define Onshape-to-Arena metadata mapping.
* [ ] Define revision rules.
* [ ] Define required drawing outputs.
* [ ] Define release package.
* [ ] Prototype Arena item creation.
* [ ] Prototype drawing upload.
* [ ] Define failure recovery.
* [ ] Complete pilot release.
* [ ] Validate lifecycle state synchronization.

## Phase 4 — Remote UI
* [ ] Define user groups.
* [ ] Define search workflow.
* [ ] Define browse structure.
* [ ] Define drawing detail view.
* [ ] Define drawing retrieval workflow.
* [ ] Define configurator workflow.
* [ ] Develop application backend.
* [ ] Build search interface.
* [ ] Build product library interface.
* [ ] Build configuration interface.
* [ ] Add Onshape integration.
* [ ] Add Arena status information.
* [ ] Implement validation.
* [ ] Conduct user testing.

## Phase 5 — Full Automation
* [ ] Connect UI configuration to Onshape.
* [ ] Generate configured CAD automatically.
* [ ] Assign part numbers automatically.
* [ ] Generate drawing outputs.
* [ ] Create Arena release package.
* [ ] Initiate controlled release process.
* [ ] Synchronise released status.
* [ ] Make released output available through repository.
* [ ] Implement end-to-end auditing.
* [ ] Perform production validation.

---

# Definition of Done by Phase

## Phase 1
Phase 1 is complete when a new product family can be added using the agreed Onshape architecture without redesigning the repository.

## Phase 2
Phase 2 is complete when a configuration requiring a new controlled identity can receive a unique part number without manual duplicate checking.

## Phase 3
Phase 3 is complete when a configured design can move from Onshape into Arena using a documented, reliable, revision-controlled process.

## Phase 4
Phase 4 is complete when users can search, browse, retrieve, and configure designs without manually navigating the engineering document structure.

## Phase 5
Phase 5 is complete when an approved configurable design can move through the complete workflow with reliable traceability:

```text
User Request
→ Configuration
→ Onshape
→ Part Number
→ Drawing
→ Arena
→ Release
→ Retrieval
```

---

# Open Decisions
Maintain unresolved decisions here.

## Onshape
* [ ] Final library document structure:
* [ ] One library document vs multiple documents:
* [ ] Shared component document strategy:
* [ ] Standard Part Studio pattern:
* [ ] Assembly pattern:
* [ ] Configuration table structure:
* [ ] Variable naming standard:
* [ ] Configuration naming standard:
* [ ] Drawing template:
* [ ] Required drawing outputs:
* [ ] Metadata/property standard:
* [ ] Strategy for existing Inventory library:
* [ ] Strategy for existing SMP library:

## Part Numbering
* [ ] Current numbering authority:
* [ ] Number format:
* [ ] Number allocation API:
* [ ] Reservation process:
* [ ] Assembly numbering rules:
* [ ] Drawing numbering rules:
* [ ] Configured-product numbering rules:

## Arena
* [ ] Arena item types:
* [ ] Revision scheme:
* [ ] Lifecycle states:
* [ ] Required metadata:
* [ ] Required attachments:
* [ ] Approval process:
* [ ] Release automation level:

## Remote UI
* [ ] Frontend framework:
* [ ] Backend framework:
* [ ] Database:
* [ ] Search/index technology:
* [ ] Hosting:
* [ ] Authentication:
* [ ] User roles:
* [ ] Onshape authentication:
* [ ] Arena authentication:
* [ ] Configuration preview method:

As decisions are resolved, move them into the relevant permanent sections of this document.

---

# Key Rules for Claude
When working on this project:
* Work according to the current project phase.
* Prioritise the Onshape architecture before building the remote UI.
* Use the Inventory Head and Footboard Library as an existing reference.
* Use the SMP Head and Footboard Library as an existing reference.
* Preserve useful existing engineering logic.
* Design for future product families.
* Avoid copying CAD models where configuration can provide reuse.
* Do not hard-code product families into application logic unnecessarily.
* Keep engineering rules within controlled engineering systems.
* Keep units explicit.
* Maintain traceability.
* Do not invent engineering values.
* Do not invent part numbering rules.
* Do not invent Onshape or Arena API endpoints.
* Do not treat an Onshape workspace as an approved design.
* Do not bypass Arena PLM revision control.
* Do not create duplicate numbering authorities.
* Do not automate a release workflow before the manual workflow is understood.
* Do not build a large UI around an unstable engineering structure.
* Record major architectural decisions as the project develops.

---

# Decision Priorities
When making implementation decisions, prioritise:
1. **Engineering correctness**
2. **Scalability**
3. **Configuration reuse**
4. **Revision integrity**
5. **Traceability**
6. **Data security**
7. **Reliability**
8. **User clarity**
9. **Maintainability**
10. **Performance**
11. **Implementation convenience**

The project should be built as an engineering system first and a user interface second.
</content>
