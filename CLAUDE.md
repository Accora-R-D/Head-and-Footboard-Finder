# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This project is a **Standard Drawing Repository and Configuration System** built around PTC Onshape, Arena PLM, and a remote user interface.

The system serves two distinct user needs:

1. **Find a standard inventory item.**
   The user selects the product they want from dropdown menus in the UI.
   The application searches **PTC Arena** for the matching standard item and returns the **released, revision-managed PDF**.
   No CAD generation takes place. Nothing is created. The application only finds and returns what Arena has already released.

2. **Create a custom configuration.**
   The user configures a variant that does not exist as a released standard item.
   This path runs through Onshape configuration, part numbering, drawing generation, and an Arena release.

Path 1 is a **retrieval** problem and is served entirely from Arena.
Path 2 is an **engineering** problem and depends on the Onshape architecture.
Do not blur the two. A standard item must never be regenerated from CAD when Arena already holds a released PDF for it.

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

**Exception:** the standard inventory item search (path 1) reads only released Arena data.
It does not depend on the Phase 1 Onshape restructure and may be developed in parallel, provided the Arena item attributes it relies on are confirmed first.
The custom configuration workflow (path 2) must still wait for Phases 1–3.

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

## Retrieval Paths
The UI resolves a user request down one of two paths:

```text
                    User
                      │
        ┌─────────────┴─────────────┐
        │                           │
Standard Inventory Item        Custom Requirement
        │                           │
Dropdown Selection            Configuration Inputs
        │                           │
Search Arena PLM              Onshape Configuration
        │                           │
Matching Released Item        Part Number
        │                           │
Released Revision             Drawing Generated
        │                           │
Released PDF Returned         Arena Release
                                    │
                            Released PDF Returned
```

Both paths end at the same place: a released, revision-managed PDF held in Arena.
Arena is the only source of a released document. The application never issues one of its own.

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
Only parameters that are meaningful to the product definition or the UI should become user-configurable.

These are the same parameters the UI uses to search for standard inventory items in Arena.
Keep the parameter set, the naming, and the permitted values consistent across Onshape configurations, Arena item attributes, and the UI dropdowns.
A parameter that exists in Onshape but has no equivalent Arena attribute cannot be searched on, and must not be offered as a dropdown.

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

The same structured form is what the UI dropdowns produce and what the Arena search consumes.
Do not build the Arena search around parsing human-readable descriptions or item names.

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

Where more than one drawing type is released against a single item, define which one the UI returns by default when a user selects a standard item.
Do not leave that choice to the search implementation.

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

The revision shown in the PDF title block and the revision Arena reports for the item must agree.
If they do not, treat it as a data fault and report it rather than displaying one of them as correct.

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

The metadata structure should support:
* Search.
* Dropdown option values.
* Part numbering.
* Arena integration.
* User interface filtering.
* Traceability.

## Arena Attribute Requirement
The standard item search is only as good as the attributes held against Arena items.
For each searchable parameter, confirm and record:
* The exact Arena attribute that holds it.
* Its data type.
* Its unit, where it is dimensional.
* Its permitted values.
* Whether it is populated consistently across existing released items.

Do not guess Arena attribute names.
Where an attribute is missing or inconsistently populated on existing items, record it as a data-cleanup task rather than working around it with text matching on descriptions or item names.

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
* [ ] Arena attribute mapping for every searchable parameter.
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

Before this workflow runs, check whether a released Arena item already satisfies the requested configuration.
An existing standard item must be reused rather than renumbered.

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
Arena provides formal lifecycle and revision control, and holds every released PDF the UI serves.

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
* **The released PDF document itself.**
* **The searchable attributes that drive the UI dropdowns.**

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
        ↓
Item Becomes Findable Through the UI Dropdowns
```

The exact workflow must follow existing company procedures.

An item becomes visible to users only once Arena reports it as released.
There is no separate publishing step inside the application, and no way to make an item appear in the UI ahead of its Arena release.

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
Searchable Attributes
Drawing PDF
DXF
STEP
Other Manufacturing Outputs
Onshape Link
Metadata
BOM
```

Do not automatically generate unnecessary outputs.

The PDF and the searchable attributes are both mandatory.
An item released without its searchable attributes populated cannot be found through the dropdowns, however good the drawing is.

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

The revision a user is given is the Arena revision of the PDF they downloaded.
Never present an Onshape version as a revision.

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
* [ ] Arena attribute mapping for searchable parameters.
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
Develop an external interface that allows users to find and retrieve released standard inventory drawings without navigating Onshape or Arena directly.

The primary workflow is a **dropdown-driven search of Arena for released standard inventory items**, returning the released, revision-managed PDF.
Custom configuration is a secondary workflow and is subject to the earlier phases being proven.

Do not recreate Onshape configuration logic in the UI.
Do not recreate Arena revision logic in the UI.

---

# 4.1 Primary User Workflows
The interface should support:
```text
Select a Standard Inventory Item Using Dropdowns
View Item Details and Revision
Retrieve the Released PDF
Browse Product Families
Search by Part Number or Drawing Number
Check Release Status
Request a Custom Configuration
```

The dropdown-driven standard item search is the main workflow and should be the default view.

---

# 4.2 Standard Inventory Item Search
Users find standard items by making selections from dropdown menus.
They are not expected to know a part number, a drawing number, or how the engineering data is organised.

The workflow is:
```text
Select Product Family
        ↓
Select Product Type
        ↓
Select Remaining Parameters
        ↓
Search Arena for Released Items Matching the Selection
        ↓
Display Matching Released Items
        ↓
User Selects an Item
        ↓
Retrieve the Released PDF at Its Current Arena Revision
```

Every result comes from Arena.
The application does not hold its own catalogue of standard items, and must not answer a search from a local list that has drifted from Arena.

---

# 4.3 Dropdown Parameters
The dropdowns use the parameters already defined for the product configuration:

```text
Product Family
Product Type
Size
Width
Height
Material
Style
Mounting Type
```

Rules:
* Each dropdown maps to one confirmed Arena item attribute.
* Dimensional dropdowns carry explicit units, both in the option label and in the value sent to the backend.
* `Manufacturing Option` is an internal parameter and should not appear unless there is a confirmed reason to expose it.
* `Customer-Specific Dimension` is not a standard item selector. It belongs to the custom configuration workflow only.
* Do not add a dropdown for a parameter that Arena does not hold as a searchable attribute.

The exact parameter set per product family must be confirmed against Arena before the dropdowns are built.
Do not invent parameters, options, or values to fill a dropdown that has no data behind it.

---

# 4.4 Dropdown Behaviour
The dropdowns must behave as a progressive filter over real released data.

* Options are populated from Arena data, not hard-coded in the frontend.
* Selecting a value narrows the options available in the remaining dropdowns.
* Combinations that have no released item must not be selectable.
* A parameter that does not apply to the selected product family is hidden rather than shown empty.
* Partial selections are valid. A user who selects only a product family and product type should see all released items in that group.
* The user must always be able to clear a selection and start again.

If the option lists are cached or indexed for performance, the cache is a performance aid only.
Arena remains the source of truth, the cache must be refreshable, and its staleness must be visible to the application.

---

# 4.5 Search Behaviour
Searching against Arena must follow these rules:

* Only released items are returned by default.
* Unreleased, in-work, superseded, and obsolete items are excluded unless a user with the appropriate role explicitly asks for them, and they are then clearly labelled.
* Matching is performed on structured attributes, not on free-text parsing of item names or descriptions.
* No results is a valid, expected outcome. Say so plainly and offer the custom configuration route. Do not return a near match as though it were the item requested.
* Multiple matches are also valid. Show them all with enough detail to tell them apart, rather than picking one.
* An Arena error is not an empty result. Report the failure; never present it as "no items found".

Free-text search by part number, drawing number, description, and keyword should also be available, as a secondary route for users who already know what they want.

---

# 4.6 Browsing
Users should be able to browse product families as an alternative to the dropdowns.

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
Adding a product family to Arena should surface it in the UI without a frontend code change.

---

# 4.7 Item Information
Each result should show:
* Product name.
* Part number.
* Drawing number.
* Description.
* **Arena revision.**
* **Arena lifecycle state.**
* Release date where available.
* Drawing preview where available.
* Relevant dimensions with units.
* The parameter values that matched the search.
* Download option for the released PDF.
* Onshape reference where appropriate and permitted.

Revision and lifecycle state must be shown wherever a document is offered.
A user must never be able to download a PDF without seeing which revision it is.

---

# 4.8 Document Retrieval
The document returned to the user is the released PDF held in Arena.

Rules:
* Retrieve the PDF from Arena. Do not regenerate it from Onshape.
* Serve the current released revision unless a user with the appropriate role deliberately requests a historical revision.
* A historical or superseded revision must be labelled as such wherever it is displayed and, where practical, in the delivered file name.
* Never serve an unreleased or in-work document through the standard item route.
* Never modify, re-render, re-stamp, or watermark a released PDF. It is a controlled document and is passed through unaltered.
* If the PDF is cached for performance, the cache key must include the revision, and a superseded revision must not be served in place of the current one.
* If Arena reports an item as released but no PDF attachment is available, report the fault. Do not substitute a drawing from anywhere else.
* Record who retrieved which item, at which revision, and when, to whatever level the audit requirements demand.

---

# 4.9 Custom Configuration
Where no released standard item matches, a dedicated configuration workflow should allow users to request an approved product variant.

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
Submit Configuration Request
```

Configuration options should originate from Onshape or a synchronised controlled definition.
Avoid manually duplicating parameter lists in frontend source code.

The custom path must be clearly distinguished from the standard path in the UI.
A user must never be left thinking a custom request is a released standard item.

---

# 4.10 Validation
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

Dropdown selections must be re-validated at the backend before an Arena search is issued.
Never trust a value simply because it came from a dropdown the application rendered.

---

# 4.11 Generated Configuration Workflow
A future workflow may be:
```text
User Configuration
        ↓
Validation
        ↓
Check for an Existing Released Standard Item
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
Released Output Available Through the Standard Item Search
```

Do not implement this full workflow until the earlier project phases are proven.

---

# 4.12 Phase 4 Deliverables
* [ ] Confirmed Arena attribute mapping for every dropdown.
* [ ] Dropdown parameter set per product family.
* [ ] Dropdown option sourcing and refresh strategy.
* [ ] Arena search implementation for released items.
* [ ] Result list and item detail views showing revision and lifecycle state.
* [ ] Released PDF retrieval.
* [ ] Historical revision handling.
* [ ] No-result and error handling.
* [ ] Free-text search by part number and drawing number.
* [ ] Browse structure driven by metadata.
* [ ] Retrieval audit logging.
* [ ] User testing with real released data.

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
                    │ Dropdown Selection  │
                    │ Browse              │
                    │ Retrieve PDF        │
                    │ Configure           │
                    └─────────┬───────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Application Backend │
                    │                     │
                    │ Query Building      │
                    │ Validation          │
                    │ Orchestration       │
                    │ Numbering           │
                    └─────────┬───────────┘
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
      ┌────────────┐    ┌────────────┐   ┌────────────┐
      │ Arena PLM  │    │  Onshape   │   │ Option /   │
      │            │    │            │   │ Metadata   │
      │ Released   │    │ CAD        │   │ Cache      │
      │ Items      │    │ Configs    │   │            │
      │ Revisions  │    │ Drawings   │   │ Performance│
      │ PDFs       │    │            │   │ only       │
      └────────────┘    └────────────┘   └────────────┘
```

The standard item path runs UI → backend → Arena and back.
Onshape is not in that path.
The cache exists to keep dropdowns responsive and never to answer a search on its own authority.

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
| Standard inventory item existence | Arena PLM                                     |
| Released drawing PDF              | Arena PLM                                     |
| Searchable item attributes        | Arena PLM                                     |
| Released revision                 | Arena PLM                                     |
| Lifecycle status                  | Arena PLM                                     |
| Approval status                   | Arena PLM                                     |
| Change history                    | Arena PLM                                     |
| Dropdown option values            | Arena PLM, cached by the application          |
| Search index                      | Application, derived from Arena               |
| User interface metadata           | Synchronised application data                 |

If two authoritative systems disagree, do not silently resolve the discrepancy.

---

# Key Engineering Rule
Do not duplicate engineering configuration logic unnecessarily.

Where possible:
```text
Onshape defines what can be configured.
Arena controls what has been released and holds the released documents.
Application backend validates, queries, and orchestrates.
UI allows the user to interact with those systems.
```

The application is a finder and an orchestrator.
It is not a document repository, not a revision authority, and not a second catalogue of standard items.

---

# Development Priorities
When deciding what to work on next, use this priority order:
1. Onshape document architecture.
2. Configurable CAD structure.
3. Drawing generation standard.
4. Metadata and naming.
5. Arena attribute mapping for searchable parameters.
6. Scalability.
7. Part numbering.
8. Arena release workflow.
9. Dropdown-driven standard item search.
10. Remaining remote UI.
11. End-to-end automation.

Do not prioritise UI polish ahead of engineering architecture.
The Arena attribute mapping ranks high because the dropdown search cannot be built or tested without it.

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
* Hard-coded dropdown option lists.
* Copying entire models to create new size variants.
* Manual metadata duplication.
* Manual part-number assignment where automation is intended.
* UI structures that need code changes for every new product family.
* Storing released PDFs as application data rather than retrieving them from Arena.

---

# Integration Boundaries

## Arena Integration
Arena is the primary integration for the standard item workflow.

Suggested structure:
```text
services/
    arena/
        client
        search
        items
        attributes
        numbering
        revisions
        lifecycle
        releases
        attachments
```

All Arena access goes through this service.
Do not call Arena from UI code or scatter Arena queries across the backend.

---

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

Anything this service holds is derived from Arena and must be refreshable from it.

---

# Engineering Data Safety
Engineering data should always take priority over application convenience.

Do not:
* Invent engineering dimensions.
* Invent dropdown options or parameter values.
* Modify parameter limits to make a configuration succeed.
* Assume units.
* Assume an unreleased model is approved.
* Serve an unreleased or in-work document as a released one.
* Serve a superseded revision as the current one.
* Alter a released PDF in any way.
* Replace Arena revision logic with application logic.
* Present a near match as the item the user asked for.
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

This applies to dropdown values as well.
A dropdown option is a value and a unit, not a bare number with a unit implied by its label.

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
        ↓
Retrieved PDF
```

Custom designs should additionally retain the parameter values used to create them.
Retrievals should record the dropdown selections that produced the result, so a user's search can be reproduced later.

---

# Development Workflow for Claude
Before implementing a significant change:
1. Determine which project phase the work belongs to.
2. Determine whether it serves the standard item path or the custom configuration path.
3. Do not implement features belonging to later phases unless required.
4. Review existing relevant code and engineering structure.
5. Review the Inventory or SMP reference libraries where relevant.
6. Identify the authoritative source of the information.
7. Confirm the Arena attributes involved rather than assuming them.
8. Identify scalability implications.
9. Identify revision-control implications.
10. Make the smallest coherent implementation.
11. Test the implementation.
12. Document significant architectural decisions.

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
* [ ] Document the Arena item and attribute model.
* [ ] Audit attribute population on existing released items.
* [ ] Define Onshape-to-Arena metadata mapping.
* [ ] Define revision rules.
* [ ] Define required drawing outputs.
* [ ] Define release package.
* [ ] Prototype Arena item creation.
* [ ] Prototype drawing upload.
* [ ] Prototype Arena search and PDF retrieval.
* [ ] Define failure recovery.
* [ ] Complete pilot release.
* [ ] Validate lifecycle state synchronization.

## Phase 4 — Remote UI
* [ ] Define user groups.
* [ ] Map each dropdown to a confirmed Arena attribute.
* [ ] Define the dropdown parameter set per product family.
* [ ] Define dropdown option sourcing and refresh.
* [ ] Define cascading filter behaviour.
* [ ] Define browse structure.
* [ ] Define item detail view.
* [ ] Define PDF retrieval workflow.
* [ ] Define historical revision access and roles.
* [ ] Define no-result and error handling.
* [ ] Define configurator workflow.
* [ ] Develop application backend.
* [ ] Build dropdown search interface.
* [ ] Build product library interface.
* [ ] Build configuration interface.
* [ ] Add Arena integration.
* [ ] Add Onshape integration.
* [ ] Implement validation.
* [ ] Implement retrieval audit logging.
* [ ] Conduct user testing.

## Phase 5 — Full Automation
* [ ] Connect UI configuration to Onshape.
* [ ] Generate configured CAD automatically.
* [ ] Assign part numbers automatically.
* [ ] Generate drawing outputs.
* [ ] Create Arena release package.
* [ ] Initiate controlled release process.
* [ ] Synchronise released status.
* [ ] Make newly released items findable through the dropdown search.
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
Phase 4 is complete when a user can select a standard inventory item from the dropdowns and download the correct released PDF, at the correct Arena revision, without opening Arena or Onshape, and when a newly released item appears in the dropdowns without a code change.

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
* [ ] Which lifecycle states count as findable:
* [ ] Required metadata:
* [ ] Required attachments:
* [ ] Arena attribute holding each searchable parameter:
* [ ] Attribute population quality on existing released items:
* [ ] Which attachment is the released PDF where an item has several:
* [ ] Approval process:
* [ ] Release automation level:

## Remote UI
* [ ] Frontend framework:
* [ ] Backend framework:
* [ ] Database:
* [ ] Search/index technology:
* [ ] Dropdown option caching and refresh strategy:
* [ ] Behaviour when Arena is unavailable:
* [ ] Who may view historical or superseded revisions:
* [ ] Whether obsolete items are visible and how they are labelled:
* [ ] Retrieval audit requirements:
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
* Treat the standard item search and the custom configuration workflow as separate paths.
* Search Arena for standard inventory items. Do not build a parallel catalogue.
* Return the released Arena PDF unaltered.
* Show the Arena revision and lifecycle state wherever a document is offered.
* Prioritise the Onshape architecture before building the custom configuration workflow.
* Use the Inventory Head and Footboard Library as an existing reference.
* Use the SMP Head and Footboard Library as an existing reference.
* Preserve useful existing engineering logic.
* Design for future product families.
* Avoid copying CAD models where configuration can provide reuse.
* Do not hard-code product families, dropdown options, or parameter values into application logic.
* Keep engineering rules within controlled engineering systems.
* Keep units explicit, including in dropdowns.
* Maintain traceability.
* Do not invent engineering values.
* Do not invent Arena attribute names or dropdown options.
* Do not invent part numbering rules.
* Do not invent Onshape or Arena API endpoints.
* Do not treat an Onshape workspace as an approved design.
* Do not regenerate a drawing that Arena has already released.
* Do not bypass Arena PLM revision control.
* Do not create duplicate numbering authorities.
* Do not automate a release workflow before the manual workflow is understood.
* Do not build a large UI around an unstable engineering structure.
* Record major architectural decisions as the project develops.

---

# Decision Priorities
When making implementation decisions, prioritise:
1. **Engineering correctness**
2. **Revision integrity**
3. **Scalability**
4. **Configuration reuse**
5. **Traceability**
6. **Data security**
7. **Reliability**
8. **User clarity**
9. **Maintainability**
10. **Performance**
11. **Implementation convenience**

The project should be built as an engineering system first and a user interface second.
A user must never be given the wrong revision, an unreleased document, or a near match presented as an exact one.
