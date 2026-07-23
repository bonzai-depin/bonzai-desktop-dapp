const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BonzAI Proof-of-Contribution registries", function () {
  async function deployRegistries() {
    const [owner, contributor, evaluator] = await ethers.getSigners();

    const ContributionRegistry = await ethers.getContractFactory("BonzaiContributionRegistry");
    const contributionRegistry = await ContributionRegistry.deploy();

    const DatasetRegistry = await ethers.getContractFactory("BonzaiDatasetRegistry");
    const datasetRegistry = await DatasetRegistry.deploy();

    const EvaluationRegistry = await ethers.getContractFactory("BonzaiEvaluationRegistry");
    const evaluationRegistry = await EvaluationRegistry.deploy();

    const ModelRegistry = await ethers.getContractFactory("BonzaiModelRegistry");
    const modelRegistry = await ModelRegistry.deploy();

    return { owner, contributor, evaluator, contributionRegistry, datasetRegistry, evaluationRegistry, modelRegistry };
  }

  it("registers contribution, dataset, evaluation, and model lineage", async function () {
    const { contributor, evaluator, contributionRegistry, datasetRegistry, evaluationRegistry, modelRegistry } = await deployRegistries();

    const contentHash = ethers.id("sample-content");
    const contributionTx = await contributionRegistry.connect(contributor).registerContribution(
      contentHash,
      "ipfs://contribution",
      "ipfs://license",
      "https://source.example",
      0,
      91,
      2,
      [],
    );
    const contributionReceipt = await contributionTx.wait();
    const contributionEvent = contributionReceipt.logs
      .map((log) => {
        try { return contributionRegistry.interface.parseLog(log); } catch { return null; }
      })
      .find((event) => event?.name === "ContributionRegistered");
    const contributionId = contributionEvent.args.contributionId;

    const datasetTx = await datasetRegistry.connect(contributor).registerDataset(
      ethers.id("dataset"),
      "ipfs://dataset",
      "ipfs://license",
      true,
      true,
      true,
      [contributionId],
    );
    const datasetReceipt = await datasetTx.wait();
    const datasetEvent = datasetReceipt.logs
      .map((log) => {
        try { return datasetRegistry.interface.parseLog(log); } catch { return null; }
      })
      .find((event) => event?.name === "DatasetRegistered");
    const datasetId = datasetEvent.args.datasetId;

    const evaluationTx = await evaluationRegistry.connect(evaluator).registerEvaluation(
      datasetId,
      1,
      ethers.id("evaluation-evidence"),
      "ipfs://evaluation",
      88,
    );
    const evaluationReceipt = await evaluationTx.wait();
    const evaluationEvent = evaluationReceipt.logs
      .map((log) => {
        try { return evaluationRegistry.interface.parseLog(log); } catch { return null; }
      })
      .find((event) => event?.name === "EvaluationRegistered");
    const evaluationId = evaluationEvent.args.evaluationId;

    const modelTx = await modelRegistry.connect(contributor).publishModel(
      0,
      ethers.id("model"),
      "ipfs://model",
      "ipfs://license",
      contributor.address,
      84,
      [datasetId],
      [evaluationId],
    );
    const modelReceipt = await modelTx.wait();
    const modelEvent = modelReceipt.logs
      .map((log) => {
        try { return modelRegistry.interface.parseLog(log); } catch { return null; }
      })
      .find((event) => event?.name === "ModelPublished");
    const modelId = modelEvent.args.modelId;

    expect(await datasetRegistry.getDatasetContributions(datasetId)).to.deep.equal([contributionId]);
    expect(await evaluationRegistry.getTargetEvaluations(datasetId)).to.deep.equal([evaluationId]);
    expect(await modelRegistry.getModelDatasets(modelId)).to.deep.equal([datasetId]);
    expect(await modelRegistry.getModelEvaluations(modelId)).to.deep.equal([evaluationId]);
  });
});
